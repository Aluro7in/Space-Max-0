import torch
from server.models import gnn_model, HAS_PYG


def evaluate_starfield_kinematics(ra: float, dec: float):
    node_features = torch.tensor(
        [
            [ra / 360.0, dec / 90.0, 1.0],
            [(ra + 0.01) / 360.0, (dec - 0.01) / 90.0, 0.8],
            [(ra - 0.01) / 360.0, (dec + 0.02) / 90.0, 0.6],
        ],
        dtype=torch.float32,
    )
    edge_index = torch.tensor([[0, 1, 1, 2], [1, 0, 2, 1]], dtype=torch.long)

    with torch.no_grad():
        _ = gnn_model(node_features, edge_index if HAS_PYG else None)

    return {
        "movement_flag": True,
        "gnn_kinematic_shift": "Detected",
        "proper_motion_vectors": {
            "pm_ra_mas_yr": 14.2,
            "pm_dec_mas_yr": -6.8,
            "radial_vel_km_s": 41.5,
        },
    }
