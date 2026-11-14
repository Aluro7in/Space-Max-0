import io
import base64
import numpy as np
import astropy.units as u
from astroquery.skyview import SkyView
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


def generate_timemachine_comparison(sky_coords, anomaly_crop, attempt_live_skyview=False):
    archive_data = None
    survey_name = "Archival Baseline (Simulated)"

    if attempt_live_skyview:
        try:
            archive_images = SkyView.get_images(
                position=sky_coords,
                survey=['2MASS-K'],
                radius=3 * u.arcmin,
            )
            survey_name = '2MASS Archive (c. 2000)'
            if not archive_images:
                archive_images = SkyView.get_images(
                    position=sky_coords,
                    survey=['WISE 3.4'],
                    radius=3 * u.arcmin,
                )
                survey_name = 'WISE Archive (c. 2010)'
            if archive_images:
                archive_data = archive_images[0][0].data
        except Exception as e:
            print(f"SkyView unavailable ({e}). Activating Presentation Mockup Mode...")

    if archive_data is None:
        past_mockup = np.copy(anomaly_crop)
        center_y, center_x = past_mockup.shape[0] // 2, past_mockup.shape[1] // 2
        background_median = np.nanmedian(past_mockup[0:10, 0:10])
        background_std = np.nanstd(past_mockup[0:10, 0:10])
        np.random.seed(42)
        noise_patch = np.random.normal(background_median, background_std, (14, 14))
        past_mockup[center_y - 7:center_y + 7, center_x - 7:center_x + 7] = noise_patch
        archive_data = past_mockup

    # Lock identical vmin/vmax contrast percentiles for flicker-free blink comparison
    vmin = float(np.nanpercentile(anomaly_crop, 5))
    vmax = float(np.nanpercentile(anomaly_crop, 99.5))

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 5), dpi=100)
    fig.patch.set_facecolor('black')

    ax1.imshow(archive_data, cmap='magma', origin='lower', vmin=vmin, vmax=vmax)
    ax1.set_title(f'PAST: {survey_name}', color='cyan', fontsize=12, fontweight='bold', pad=12)
    ax1.axis('off')

    ax2.imshow(anomaly_crop, cmap='magma', origin='lower', vmin=vmin, vmax=vmax)
    ax2.set_title('PRESENT: SPHEREx QR2 (2025+)', color='lime', fontsize=12, fontweight='bold', pad=12)
    ax2.axis('off')

    plt.suptitle(
        f"Time-Domain Movement Check\nTarget: RA {sky_coords.ra.deg:.4f}, Dec {sky_coords.dec.deg:.4f}",
        color='white',
        fontsize=14,
        fontweight='bold',
        y=0.98,
    )
    plt.tight_layout()

    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', facecolor='black')
    plt.close(fig)
    buf.seek(0)
    side_by_side_b64 = "data:image/png;base64," + base64.b64encode(buf.read()).decode('utf-8')

    past_frame_b64 = _single_frame_b64(archive_data, vmin, vmax)
    present_frame_b64 = _single_frame_b64(anomaly_crop, vmin, vmax)

    return {
        "survey_used": survey_name,
        "timemachine_dashboard_base64": side_by_side_b64,
        "past_frame_base64": past_frame_b64,
        "present_frame_base64": present_frame_b64,
    }


def _single_frame_b64(arr, vmin, vmax):
    fig, ax = plt.subplots(figsize=(4, 4), dpi=100)
    fig.patch.set_facecolor('black')
    ax.imshow(arr, cmap='magma', origin='lower', vmin=vmin, vmax=vmax)
    ax.axis('off')
    plt.tight_layout(pad=0)
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', pad_inches=0, facecolor='black')
    plt.close(fig)
    buf.seek(0)
    return "data:image/png;base64," + base64.b64encode(buf.read()).decode('utf-8')
