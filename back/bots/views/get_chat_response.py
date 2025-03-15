from rest_framework.decorators import api_view
from rest_framework.response import Response
from bots.models import Chat, Profile, Bot
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import boto3
from django.core.files.storage import default_storage
from django.conf import settings
from PIL import Image
import io
import uuid

# Allowed image extensions
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

# S3 bucket configuration
S3_BUCKET = settings.AWS_STORAGE_BUCKET_NAME
S3_CLIENT = boto3.client('s3')

def compress_and_upload_image(file):
    try:
        # Open the image using Pillow
        image = Image.open(file)

        # Resize the image (e.g., to a maximum width/height of 800px)
        max_size = (800, 800)
        image.thumbnail(max_size)
        
        # Convert to RGB if it's not already
        if image.mode != 'RGB':
            image = image.convert('RGB')

        # Compress the image
        buffered = io.BytesIO()
        image.save(buffered, format="JPEG", quality=85)  # Adjust quality as needed
        compressed_image_data = buffered.getvalue()

        # Upload to S3
        filename = f"{str(uuid.uuid4())}.jpg"
        S3_CLIENT.upload_fileobj(io.BytesIO(compressed_image_data), S3_BUCKET, Key=filename)
        return filename
    except Exception as e:
        raise ValueError(f'Unable to upload image: {str(e)}')

@api_view(['GET', 'POST'])
def get_chat_response(request, chat_id):
    user_input = request.data.get('message')
    profile_id = request.data.get('profile')
    bot_id = request.data.get('bot')
    user = request.user

    if chat_id == 'new':
        if profile_id:
            profile = Profile.objects.get(profile_id=profile_id)
        else:
            profile = None
        if bot_id:
            bot = Bot.objects.get(bot_id=bot_id)
        else:
            bot = None
        chat = Chat.objects.create(title=user_input, profile=profile, bot=bot, user=user)
        system_prompt = chat.get_system_message()
        if bot:
            system_prompt = bot.system_prompt
        chat.messages.create(text=system_prompt, role='system', order=0)

    else:
        chat = Chat.objects.get(chat_id=chat_id)
    
    # Handle image uploads if present
    filename = None
    if request.method == 'POST' and request.FILES:
        file = request.FILES.get('image')  # Only allow one image
        if file.size > 20 * 1024 * 1024:
            return JsonResponse({'error': 'File size exceeds 20MB limit'}, status=400)
        if not allowed_file(file.name):
            return JsonResponse({'error': 'Invalid file type'}, status=400)
        filename = compress_and_upload_image(file)


    # Save the message with the uploaded image filename
    chat.messages.create(text=user_input, role='user', order=chat.messages.count(), image_filename=filename)

    response = chat.get_response()
    return Response({'response': response, 'chat_id': chat.chat_id})

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
