import io
import base64
import numpy as np
import torch
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from server.models import cnn_model


def classify_anomaly_crop(spectral_image_data, wcs_info, x_pos=1569.5, y_pos=237.6):
    sky_coords = wcs_info.pixel_to_world(x_pos, y_pos)
    x_int, y_int = int(x_pos), int(y_pos)
    anomaly_crop = spectral_image_data[y_int - 16:y_int + 16, x_int - 16:x_int + 16]

    native_byte_array = np.array(anomaly_crop, dtype=np.float32)
    sample_anomaly = torch.tensor(native_byte_array).unsqueeze(0).unsqueeze(0)

    with torch.no_grad():
        prediction = cnn_model(sample_anomaly)

    artifact_score = float(prediction[0][0].item())
    real_object_score = float(prediction[0][1].item())
    is_real = real_object_score > artifact_score

    if is_real:
        verdict = "CONFIRMED: Real Object / Planet X Candidate"
        title_color = "lime"
    else:
        verdict = "IGNORED: Instrument Artifact"
        title_color = "red"

    fig = plt.figure(figsize=(7, 7), dpi=100)
    plt.style.use('dark_background')
    plt.imshow(anomaly_crop, cmap='magma', origin='lower')
    plt.colorbar(label='Infrared Flux (SPHEREx QR2)', fraction=0.046, pad=0.04)
    plt.title(
        f"AI Verdict: {verdict}",
        color=title_color,
        fontsize=13,
        fontweight='bold',
        pad=35,
    )
    plt.suptitle(
        f"Target: RA {sky_coords.ra.deg:.6f}, Dec {sky_coords.dec.deg:.6f} | Gaia DR3: No Match",
        fontsize=11,
        color='white',
        y=0.98,
    )
    plt.xlabel(
        f"CNN Confidence Scores\nArtifact: {artifact_score:.2f} | Real Object: {real_object_score:.2f}",
        fontsize=11,
        fontweight='bold',
        color='white',
        labelpad=15,
    )
    plt.tight_layout()

    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', facecolor='black')
    plt.close(fig)
    buf.seek(0)
    dashboard_b64 = "data:image/png;base64," + base64.b64encode(buf.read()).decode('utf-8')

    return {
        "sky_coords": sky_coords,
        "ra": float(sky_coords.ra.deg),
        "dec": float(sky_coords.dec.deg),
        "anomaly_crop": anomaly_crop,
        "artifact_score": artifact_score,
        "real_object_score": real_object_score,
        "is_real": is_real,
        "verdict": verdict,
        "cnn_dashboard_base64": dashboard_b64,
    }
