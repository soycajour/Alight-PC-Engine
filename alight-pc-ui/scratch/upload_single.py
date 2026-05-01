import os
from videodb import connect
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("VIDEO_DB_API_KEY")
conn = connect(api_key=api_key)

video_name = "Adobe After Effects Tutorial for Beginners Interface Explained - MayurT (1080p).mp4"
base_path = r"D:\After Effects-Alight Motion Interface"
file_path = os.path.join(base_path, video_name)

print(f"Uploading {video_name}...")
video = conn.upload(file_path=file_path)
print(f"Success! Video ID: {video.id}")
