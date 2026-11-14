import numpy as np
import torch
from server.models import rnn_model

CHEMICAL_DICTIONARY = {
    0: "Main Sequence Star",
    1: "Brown Dwarf (Water/Methane Dips Detected)",
    2: "Asteroid (Silicate Signature)",
    3: "Instrument Noise",
}


def analyze_102_band_spectrum():
    wavelengths = np.linspace(0.75, 5.0, 102)
    temperature_curve = np.exp(-0.5 * ((wavelengths - 1.5) / 1.0) ** 2) * 100

    water_dip = np.where((wavelengths > 1.35) & (wavelengths < 1.45), 0.4, 1.0)
    methane_dip = np.where((wavelengths > 3.2) & (wavelengths < 3.4), 0.2, 1.0)
    co_dip = np.where((wavelengths > 4.5) & (wavelengths < 4.8), 0.5, 1.0)

    np.random.seed(42)
    spectrum_1d = (
        temperature_curve * water_dip * methane_dip * co_dip
    ) + np.random.normal(0, 1.5, 102)
    spectrum_1d = spectrum_1d.astype(np.float32)

    rnn_input = torch.tensor(spectrum_1d, dtype=torch.float32).unsqueeze(0).unsqueeze(2)
    with torch.no_grad():
        rnn_pred = rnn_model(rnn_input)
    chemical_class_idx = int(torch.argmax(rnn_pred).item())
    chemical_classification = CHEMICAL_DICTIONARY.get(chemical_class_idx, "Unknown")

    return {
        "wavelengths": wavelengths.tolist(),
        "spectrum_1d": spectrum_1d.tolist(),
        "chemical_class_idx": chemical_class_idx,
        "chemical_classification": chemical_classification,
    }
