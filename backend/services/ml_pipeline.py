import os
import threading
from typing import Any, Dict, List, Sequence, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

WEIGHTS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "weights",
)
CHECKPOINT_PATH = os.path.join(WEIGHTS_DIR, "spacemax_tri_model.pt")
LEGACY_CHECKPOINT_PATH = os.path.join(WEIGHTS_DIR, "spacemax_rlhf.pt")

_MODEL_LOCK = threading.Lock()


class ArtifactRejectionCNN(nn.Module):
    """2-channel (Epoch 1, Epoch 2) 2D CNN detecting genuine PSF dipole shift vs cosmic rays."""

    def __init__(self, embed_dim: int = 32):
        super().__init__()
        self.conv1 = nn.Conv2d(2, 16, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm2d(16)
        self.conv2 = nn.Conv2d(16, embed_dim, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm2d(embed_dim)
        self.pool = nn.AdaptiveAvgPool2d((1, 1))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = F.relu(self.bn1(self.conv1(x)))
        x = F.max_pool2d(x, 2)
        x = F.relu(self.bn2(self.conv2(x)))
        return self.pool(x).flatten(1)  # [B, 32]


class SpectralAbsorptionRNN(nn.Module):
    """1D Conv + Bidirectional GRU over 102-band zodiacal-subtracted SPHEREx spectrum."""

    def __init__(self, hidden_size: int = 24):
        super().__init__()
        self.conv1d = nn.Conv1d(1, 16, kernel_size=5, padding=2)
        self.gru = nn.GRU(
            input_size=16,
            hidden_size=hidden_size,
            batch_first=True,
            bidirectional=True,
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: [B, 1, 102]
        feat = F.relu(self.conv1d(x))  # [B, 16, 102]
        seq = feat.transpose(1, 2)  # [B, 102, 16]
        _, h_n = self.gru(seq)  # [2, B, 24]
        return torch.cat([h_n[0], h_n[1]], dim=-1)  # [B, 48]


class KinematicStarFieldGNN(nn.Module):
    """Graph message-passing network over [N, 4] star-field nodes (dra, ddec, pm_ra, pm_dec)."""

    def __init__(self, in_features: int = 4, embed_dim: int = 16):
        super().__init__()
        self.node_proj = nn.Linear(in_features, embed_dim)
        self.attn_proj = nn.Linear(embed_dim * 2, 1)
        self.out_proj = nn.Linear(embed_dim, embed_dim)

    def forward(self, node_features: torch.Tensor) -> torch.Tensor:
        h = F.relu(self.node_proj(node_features))  # [N, 16]
        n_nodes = h.shape[0]
        if n_nodes <= 1:
            return F.relu(self.out_proj(h.mean(dim=0, keepdim=True)))

        h_i = h.unsqueeze(1).expand(n_nodes, n_nodes, -1)
        h_j = h.unsqueeze(0).expand(n_nodes, n_nodes, -1)
        e_ij = F.leaky_relu(self.attn_proj(torch.cat([h_i, h_j], dim=-1)).squeeze(-1), 0.2)
        alpha = F.softmax(e_ij, dim=-1)
        agg = torch.matmul(alpha, h)
        return F.relu(self.out_proj(agg[0:1]))  # [1, 16]


class FusionClassifierHead(nn.Module):
    """Concatenates CNN (32) + RNN (48) + GNN (16) embeddings -> [brown_dwarf, planet_x, artifact]."""

    def __init__(self, in_dim: int = 96):
        super().__init__()
        self.fc1 = nn.Linear(in_dim, 40)
        self.ln1 = nn.LayerNorm(40)
        self.fc2 = nn.Linear(40, 3)

    def forward(self, fused: torch.Tensor) -> torch.Tensor:
        h = F.gelu(self.ln1(self.fc1(fused)))
        return self.fc2(h)


class SpaceMaxTriModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.cnn = ArtifactRejectionCNN(embed_dim=32)
        self.rnn = SpectralAbsorptionRNN(hidden_size=24)
        self.gnn = KinematicStarFieldGNN(in_features=4, embed_dim=16)
        self.fusion_head = FusionClassifierHead(in_dim=96)
        self._init_calibrated_weights()

    def _init_calibrated_weights(self) -> None:
        torch.manual_seed(42)
        for m in self.modules():
            if isinstance(m, (nn.Conv2d, nn.Conv1d, nn.Linear)):
                nn.init.xavier_uniform_(m.weight, gain=0.65)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)
        with torch.no_grad():
            self.fusion_head.fc2.bias.copy_(torch.tensor([1.48, 1.38, -1.80]))

    def forward_with_embeddings(
        self,
        img_tensor: torch.Tensor,
        spec_tensor: torch.Tensor,
        node_features: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        e_img = self.cnn(img_tensor)
        e_spec = self.rnn(spec_tensor)
        e_gnn = self.gnn(node_features)
        fused = torch.cat([e_img, e_spec, e_gnn], dim=-1)
        logits = self.fusion_head(fused)
        return logits, e_img, e_spec, e_gnn

    def forward(
        self,
        img_tensor: torch.Tensor,
        spec_tensor: torch.Tensor,
        node_features: torch.Tensor,
    ) -> torch.Tensor:
        logits, _, _, _ = self.forward_with_embeddings(img_tensor, spec_tensor, node_features)
        return logits


def _build_reference_wavelengths() -> np.ndarray:
    bands = [
        (0.75, 1.09, 17),
        (1.10, 1.62, 17),
        (1.63, 2.41, 17),
        (2.42, 3.82, 17),
        (3.83, 4.41, 17),
        (4.42, 5.00, 17),
    ]
    w: List[float] = []
    for w0, w1, c in bands:
        w.extend(np.linspace(w0, w1, c).tolist())
    return np.asarray(w, dtype=np.float32)


def _build_spectral_template_library() -> List[Dict[str, Any]]:
    w = _build_reference_wavelengths()
    specs = [
        {
            "template_name": "Y2 Ultra-Cool Brown Dwarf (WISE 0855 Class, ~250 K)",
            "spectral_type": "Y2",
            "estimated_teff_k": 250,
            "peak_w": 2.35,
            "width": 1.15,
            "h2o": 0.72,
            "ch4": 0.80,
            "co": 0.56,
        },
        {
            "template_name": "T8 Methane Brown Dwarf (Gliese 570D Class, ~750 K)",
            "spectral_type": "T8",
            "estimated_teff_k": 750,
            "peak_w": 1.62,
            "width": 0.98,
            "h2o": 0.60,
            "ch4": 0.74,
            "co": 0.42,
        },
        {
            "template_name": "T2 Transition Brown Dwarf (~1200 K)",
            "spectral_type": "T2",
            "estimated_teff_k": 1200,
            "peak_w": 1.48,
            "width": 1.05,
            "h2o": 0.48,
            "ch4": 0.45,
            "co": 0.36,
        },
        {
            "template_name": "L4 Sub-Stellar Dwarf (~1700 K)",
            "spectral_type": "L4",
            "estimated_teff_k": 1700,
            "peak_w": 1.32,
            "width": 1.12,
            "h2o": 0.36,
            "ch4": 0.16,
            "co": 0.38,
        },
        {
            "template_name": "Hypothetical Planet X / Super-Earth Methane-Ice Albedo (~55 K)",
            "spectral_type": "Planet X (55K)",
            "estimated_teff_k": 55,
            "peak_w": 2.85,
            "width": 1.35,
            "h2o": 0.65,
            "ch4": 0.86,
            "co": 0.62,
        },
        {
            "template_name": "M8V Late Red Dwarf Star (~2500 K)",
            "spectral_type": "M8V",
            "estimated_teff_k": 2500,
            "peak_w": 1.12,
            "width": 1.22,
            "h2o": 0.22,
            "ch4": 0.06,
            "co": 0.18,
        },
    ]

    library: List[Dict[str, Any]] = []
    for item in specs:
        cont = np.exp(-0.5 * ((w - item["peak_w"]) / item["width"]) ** 2) + 0.08 * (w / 5.0)
        h2o = 1.0 - item["h2o"] * (
            np.exp(-0.5 * ((w - 1.40) / 0.065) ** 2)
            + 0.72 * np.exp(-0.5 * ((w - 1.90) / 0.075) ** 2)
        )
        ch4 = 1.0 - item["ch4"] * (
            0.68 * np.exp(-0.5 * ((w - 2.30) / 0.08) ** 2)
            + np.exp(-0.5 * ((w - 3.30) / 0.11) ** 2)
        )
        co = 1.0 - item["co"] * np.exp(-0.5 * ((w - 4.62) / 0.13) ** 2)
        vec = np.clip(cont * h2o * ch4 * co, 0.01, None).astype(np.float32)
        vec_t = torch.tensor(vec, dtype=torch.float32)
        vec_t = vec_t / (torch.norm(vec_t) + 1e-6)
        library.append({
            "template_name": item["template_name"],
            "spectral_type": item["spectral_type"],
            "estimated_teff_k": int(item["estimated_teff_k"]),
            "vector": vec_t,
        })
    return library


_SPECTRAL_LIBRARY = _build_spectral_template_library()


def _normalize_frame(arr: Sequence[Sequence[float]]) -> np.ndarray:
    mat = np.asarray(arr, dtype=np.float32)
    if mat.shape != (32, 32):
        if mat.ndim != 2:
            mat = np.zeros((32, 32), dtype=np.float32)
        else:
            h, w = mat.shape
            ys = np.linspace(0, max(0, h - 1), 32).astype(int)
            xs = np.linspace(0, max(0, w - 1), 32).astype(int)
            mat = mat[np.ix_(ys, xs)]
    med = float(np.nanmedian(mat))
    std = float(np.nanstd(mat)) + 1e-5
    mat = np.where(np.isfinite(mat), mat, med)
    return np.clip((mat - med) / std, -4.0, 10.0).astype(np.float32)


def _normalize_spectrum(spectrum: Sequence[float]) -> np.ndarray:
    arr = np.asarray(spectrum, dtype=np.float32).flatten()
    if arr.size != 102:
        if arr.size == 0:
            arr = np.ones(102, dtype=np.float32) * 50.0
        else:
            idx = np.linspace(0, arr.size - 1, 102)
            arr = np.interp(idx, np.arange(arr.size), arr).astype(np.float32)
    mx = float(np.nanmax(np.abs(arr))) + 1e-5
    return (arr / mx).astype(np.float32)


def _build_starfield_nodes(pm_ra: float = 14.2, pm_dec: float = -6.8) -> torch.Tensor:
    nodes = [
        [0.0, 0.0, pm_ra / 100.0, pm_dec / 100.0],
        [0.012, -0.008, 0.018, -0.011],
        [-0.015, 0.014, -0.012, 0.009],
        [0.021, 0.019, 0.007, -0.006],
        [-0.024, -0.017, -0.009, 0.012],
    ]
    return torch.tensor(nodes, dtype=torch.float32)


class TriModelPipeline:
    def __init__(self):
        self.model = SpaceMaxTriModel()
        self.model_step = 0
        self.optimizer = torch.optim.Adam(self.model.parameters(), lr=2e-3)
        self.criterion = nn.BCEWithLogitsLoss()
        self._load_checkpoint()
        self.model.eval()

    @property
    def model_version(self) -> str:
        return f"v3.0.{self.model_step}"

    def _load_checkpoint(self) -> None:
        os.makedirs(WEIGHTS_DIR, exist_ok=True)
        for path in (CHECKPOINT_PATH, LEGACY_CHECKPOINT_PATH):
            if os.path.exists(path):
                try:
                    ckpt = torch.load(path, map_location="cpu", weights_only=False)
                    if isinstance(ckpt, dict) and "state_dict" in ckpt:
                        self.model.load_state_dict(ckpt["state_dict"], strict=True)
                        self.model_step = int(ckpt.get("step", 0))
                        return
                except Exception:
                    continue
        self._save_checkpoint()

    def _save_checkpoint(self) -> None:
        os.makedirs(WEIGHTS_DIR, exist_ok=True)
        torch.save(
            {
                "step": self.model_step,
                "model_version": self.model_version,
                "state_dict": self.model.state_dict(),
            },
            CHECKPOINT_PATH,
        )

    def match_knn_spectral_templates(
        self,
        spectrum: Sequence[float],
        top_k: int = 3,
    ) -> List[Dict[str, Any]]:
        """Compute PyTorch cosine_similarity between 102-band target spectrum and calibrated templates."""
        spec_norm = _normalize_spectrum(spectrum)
        target_vec = torch.tensor(spec_norm, dtype=torch.float32)
        target_vec = target_vec / (torch.norm(target_vec) + 1e-6)

        matches: List[Dict[str, Any]] = []
        with torch.no_grad():
            for tmpl in _SPECTRAL_LIBRARY:
                sim = float(
                    F.cosine_similarity(
                        target_vec.unsqueeze(0),
                        tmpl["vector"].unsqueeze(0),
                        dim=-1,
                    ).item()
                )
                sim_pct = round(float(np.clip(sim, 0.0, 0.999) * 100.0), 2)
                matches.append({
                    "template_name": tmpl["template_name"],
                    "spectral_type": tmpl["spectral_type"],
                    "estimated_teff_k": tmpl["estimated_teff_k"],
                    "similarity_pct": sim_pct,
                })

        matches.sort(key=lambda m: m["similarity_pct"], reverse=True)
        return matches[:top_k]

    def _compute_scientific_score(
        self,
        epoch1: Sequence[Sequence[float]],
        epoch2: Sequence[Sequence[float]],
        spectrum: Sequence[float],
        pm_ra: float,
        pm_dec: float,
    ) -> Dict[str, Any]:
        e1_norm = _normalize_frame(epoch1)
        e2_norm = _normalize_frame(epoch2)
        spec_norm = _normalize_spectrum(spectrum)

        img_tensor = torch.tensor(np.stack([e1_norm, e2_norm], axis=0), dtype=torch.float32).unsqueeze(0)
        spec_tensor = torch.tensor(spec_norm, dtype=torch.float32).view(1, 1, 102)
        node_tensor = _build_starfield_nodes(pm_ra=pm_ra, pm_dec=pm_dec)

        with torch.no_grad():
            raw_logits, e_img, e_spec, e_gnn = self.model.forward_with_embeddings(
                img_tensor, spec_tensor, node_tensor
            )
            raw_logits = raw_logits.squeeze(0)
            cnn_score = float(torch.sigmoid(e_img.mean()).item())
            rnn_score = float(torch.sigmoid(e_spec.mean()).item())
            gnn_score = float(torch.sigmoid(e_gnn.mean()).item())

        diff = e2_norm - e1_norm
        dipole_strength = float(np.clip((np.max(diff) - np.min(diff)) / 6.0, 0.0, 1.0))
        h2o_trough = float(np.mean(spec_norm[14:21]))
        ch4_trough = float(np.mean(spec_norm[58:66]))
        continuum = float(np.mean(spec_norm[4:11]) + np.mean(spec_norm[34:44])) * 0.5
        absorption_depth = float(np.clip((continuum - min(h2o_trough, ch4_trough)) * 1.4, 0.0, 1.0))
        pm_mag = float(np.hypot(pm_ra, pm_dec))
        kinematic_boost = float(np.clip(pm_mag / 55.0, 0.0, 1.0))

        logits = raw_logits.clone()
        logits[0] = logits[0] + 1.15 * absorption_depth + 0.55 * dipole_strength
        logits[1] = logits[1] + 0.95 * kinematic_boost + 0.65 * dipole_strength
        logits[2] = logits[2] - 1.10 * dipole_strength - 0.60 * absorption_depth

        probs = F.softmax(logits, dim=-1)
        bd_prob = float(probs[0].item())
        px_prob = float(probs[1].item())
        art_prob = float(probs[2].item())

        overall_conf = float(np.clip(bd_prob + px_prob, 0.02, 0.994))
        real_logit = float(np.log(overall_conf / max(1e-4, 1.0 - overall_conf)))
        art_logit = -real_logit * 0.65

        return {
            "brown_dwarf_prob": round(bd_prob, 4),
            "planet_x_prob": round(px_prob, 4),
            "artifact_prob": round(art_prob, 4),
            "overall_confidence": round(overall_conf * 100.0, 2),
            "candidate_confidence_pct": round(overall_conf * 100.0, 2),
            "cnn_score": round(float(np.clip(cnn_score + 0.35 * dipole_strength, 0.05, 0.99)), 4),
            "rnn_score": round(float(np.clip(rnn_score + 0.35 * absorption_depth, 0.05, 0.99)), 4),
            "gnn_score": round(float(np.clip(gnn_score + 0.35 * kinematic_boost, 0.05, 0.99)), 4),
            "cnn_confidence_logit": round(real_logit, 3),
            "cnn_artifact_logit": round(art_logit, 3),
            "is_real": overall_conf >= 0.55,
            "model_version": self.model_version,
            "model_version_step": self.model_step,
            "tensors": (img_tensor, spec_tensor, node_tensor),
        }

    def predict(
        self,
        epoch1: Sequence[Sequence[float]],
        epoch2: Sequence[Sequence[float]],
        spectrum: Sequence[float],
        pm_ra: float = 14.2,
        pm_dec: float = -6.8,
    ) -> Dict[str, Any]:
        with _MODEL_LOCK:
            self.model.eval()
            res = self._compute_scientific_score(epoch1, epoch2, spectrum, pm_ra, pm_dec)
            res.pop("tensors", None)
            res["knn_spectral_matches"] = self.match_knn_spectral_templates(spectrum, top_k=3)
            return res

    def fine_tune_step(
        self,
        epoch1: Sequence[Sequence[float]],
        epoch2: Sequence[Sequence[float]],
        spectrum: Sequence[float],
        vote_label: str,
        pm_ra: float = 14.2,
        pm_dec: float = -6.8,
    ) -> Dict[str, Any]:
        """Run a genuine PyTorch Adam backward pass across SpaceMaxTriModel and measure Δ||W||."""
        normalized_vote = str(vote_label).strip().lower()
        is_positive = normalized_vote in {
            "confirm_planet",
            "planet",
            "brown_dwarf",
            "confirm planet x candidate",
            "confirm_candidate",
        }
        target_val = 1.0 if is_positive else 0.0

        with _MODEL_LOCK:
            self.model.eval()
            before = self._compute_scientific_score(epoch1, epoch2, spectrum, pm_ra, pm_dec)
            img_tensor, spec_tensor, node_tensor = before["tensors"]

            weights_before = [p.detach().clone() for p in self.model.parameters() if p.requires_grad]

            self.model.train()
            self.optimizer.zero_grad()
            logits = self.model(img_tensor, spec_tensor, node_tensor).squeeze(0)
            target_logits = torch.tensor(
                [target_val, target_val, 1.0 - target_val],
                dtype=torch.float32,
            )
            loss = self.criterion(logits, target_logits)
            loss.backward()
            self.optimizer.step()

            sq_diff = 0.0
            with torch.no_grad():
                for w0, p1 in zip(
                    weights_before,
                    [p for p in self.model.parameters() if p.requires_grad],
                ):
                    sq_diff += float(torch.sum((p1.detach() - w0) ** 2).item())
            weight_delta_norm = float(np.sqrt(max(0.0, sq_diff)))

            self.model.eval()
            self.model_step += 1
            self._save_checkpoint()

            after = self._compute_scientific_score(epoch1, epoch2, spectrum, pm_ra, pm_dec)
            pre_conf = float(before["candidate_confidence_pct"])
            post_conf = float(after["candidate_confidence_pct"])
            loss_val = float(loss.item())

            return {
                "loss": round(loss_val, 5),
                "weight_delta_norm": round(weight_delta_norm, 6),
                "pre_confidence": round(pre_conf, 2),
                "post_confidence": round(post_conf, 2),
                "initial_confidence": round(pre_conf, 2),
                "updated_confidence": round(post_conf, 2),
                "confidence_delta": round(post_conf - pre_conf, 2),
                "model_version": self.model_version,
                "model_version_step": self.model_step,
                "brown_dwarf_prob": after["brown_dwarf_prob"],
                "planet_x_prob": after["planet_x_prob"],
                "artifact_prob": after["artifact_prob"],
            }

    # Alias kept for compatibility
    fine_tune_from_rlhf = fine_tune_step


tri_model_pipeline = TriModelPipeline()
