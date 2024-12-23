from rest_framework.decorators import api_view
from rest_framework.response import Response
from bots.models import Chat, Profile, Bot

@api_view(['GET', 'POST'])
def get_response_api(request, chat_id):
    user_input = request.data.get('message')
    profile_id = request.data.get('profile')
    bot_id = request.data.get('bot')

    if chat_id == 'new':
        if profile_id:
            profile = Profile.objects.get(profile_id=profile_id)
        else:
            profile = None
        if bot_id:
            bot = Bot.objects.get(bot_id=bot_id)
        else:
            bot = None
        chat = Chat.objects.create(title=user_input, profile=profile, bot=bot)
        system_prompt = chat.get_system_message()
        if bot:
            system_prompt = bot.system_prompt
        chat.messages.create(text=system_prompt, role='system', order=0)

    else:
        chat = Chat.objects.get(chat_id=chat_id)
    
    chat.messages.create(text=user_input, role='user', order=chat.messages.count())

    response = chat.get_response()
    return Response({'response': response, 'chat_id': chat.chat_id})
