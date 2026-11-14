import io
import base64
import boto3
from botocore.config import Config
from botocore import UNSIGNED
from astropy.io import fits
from astropy.wcs import WCS
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


class SPHERExAWSIngestion:
    def __init__(self):
        self.bucket_name = 'nasa-irsa-spherex'
        self.prefix = 'qr2/level2/'
        self.s3_url = None
        self.target_file = None
        self.spectral_image_data = None
        self.image_header = None
        self.wcs_info = None

    def connect_and_stream(self):
        if self.spectral_image_data is not None:
            return self.spectral_image_data, self.wcs_info

        print("Connecting to AWS...")
        s3 = boto3.client('s3', config=Config(signature_version=UNSIGNED))

        print("Searching for data files...")
        response = s3.list_objects_v2(
            Bucket=self.bucket_name,
            Prefix=self.prefix,
            MaxKeys=50,
        )

        for obj in response.get('Contents', []):
            if obj['Key'].endswith('.fits'):
                self.target_file = obj['Key']
                break

        if not self.target_file:
            raise FileNotFoundError("Could not find a .fits file in that directory.")

        self.s3_url = f"https://{self.bucket_name}.s3.amazonaws.com/{self.target_file}"
        print(f"Streaming data from: {self.s3_url}")

        with fits.open(self.s3_url) as hdulist:
            self.spectral_image_data = np.array(hdulist['IMAGE'].data, dtype=np.float32)
            self.image_header = hdulist['IMAGE'].header
            self.wcs_info = WCS(self.image_header)

        print(f"SUCCESS! Data loaded into memory. Shape: {self.spectral_image_data.shape}")
        return self.spectral_image_data, self.wcs_info

    def render_full_array_base64(self):
        self.connect_and_stream()
        fig = plt.figure(figsize=(8, 8), dpi=100)
        plt.style.use('dark_background')

        vmin = np.nanpercentile(self.spectral_image_data, 1)
        vmax = np.nanpercentile(self.spectral_image_data, 98)

        plt.imshow(
            self.spectral_image_data,
            origin='lower',
            cmap='inferno',
            vmin=vmin,
            vmax=vmax,
        )
        plt.colorbar(label='Infrared Flux (Brightness)', fraction=0.046, pad=0.04)
        plt.title('SPHEREx Infrared Array (QR2)', fontsize=14, fontweight='bold')
        plt.tight_layout()

        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', facecolor='black')
        plt.close(fig)
        buf.seek(0)
        return "data:image/png;base64," + base64.b64encode(buf.read()).decode('utf-8')


aws_store = SPHERExAWSIngestion()
