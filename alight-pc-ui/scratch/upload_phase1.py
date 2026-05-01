import os
from videodb import connect
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("VIDEO_DB_API_KEY")
conn = connect(api_key=api_key)

videos_to_upload = [
    # "Alight PC Locacl Recording.mp4", # Already uploaded
    "02. Layers Learn alight motion from zero to infinity. - Infinite Designs (720p).mp4",
    "Adobe After Effects Tutorial for Beginners Interface Explained - MayurT (1080p).mp4"
]

base_path = r"D:\After Effects-Alight Motion Interface"

# Index the first one that was uploaded but failed to index
video_id = "m-z-019de453-7de1-7043-a92e-2d62485637ac"
print(f"Indexing already uploaded video: {video_id}")
try:
    video = conn.get_video(video_id)
    # Trying different indexing methods for UI/Visual analysis
    video.index_spoken_words() # For speech
    print(f"Indexed spoken words for {video_id}")
except Exception as e:
    print(f"Error indexing {video_id}: {e}")

for video_name in videos_to_upload:
    file_path = os.path.join(base_path, video_name)
    if os.path.exists(file_path):
        print(f"Uploading {video_name}...")
        video = conn.upload(file_path=file_path)
        print(f"Success! Video ID: {video.id} for {video_name}")
        try:
            video.index_spoken_words()
            print(f"Indexing started for {video_name}")
        except:
            print(f"Warning: Could not index {video_name}")
    else:
        print(f"Error: {file_path} not found.")
