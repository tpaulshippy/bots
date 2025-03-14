from rest_framework.decorators import api_view
from rest_framework.response import Response
from bots.models import Chat, Profile, Bot
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import boto3
from django.core.files.storage import default_storage
from django.conf import settings

# Allowed image extensions
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

# S3 bucket configuration
S3_BUCKET = settings.AWS_STORAGE_BUCKET_NAME
S3_CLIENT = boto3.client('s3')

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
        try:
            filename = default_storage.save(file.name, file)
            S3_CLIENT.upload_fileobj(file, S3_BUCKET, Key=filename)
            image_url = f'https://{S3_BUCKET}.s3.amazonaws.com/{filename}'
        except Exception as e:
            # Handle the exception (e.g., log the error)
            return JsonResponse({'error': str(e)}, status=500)
        finally:
            # This will run regardless of whether an exception occurred
            default_storage.delete(file.name)

    # Save the message with the uploaded image filename
    chat.messages.create(text=user_input, role='user', order=chat.messages.count(), image_filename=filename)

    response = chat.get_response()
    return Response({'response': response, 'chat_id': chat.chat_id})

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
