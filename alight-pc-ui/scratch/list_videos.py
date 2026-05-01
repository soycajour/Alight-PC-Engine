import os
from videodb import connect
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("VIDEO_DB_API_KEY")
conn = connect(api_key=api_key)

videos = conn.get_collection().get_videos()
for v in videos:
    print(f"ID: {v.id} | Name: {v.name}")
