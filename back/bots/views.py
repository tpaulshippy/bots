from rest_framework.decorators import api_view
from rest_framework.response import Response
from bots.models import Chat

@api_view(['GET', 'POST'])
def get_response_api(request, chat_id):
    user_input = request.data.get('message')

    if chat_id == 'new':
        chat = Chat.objects.create(title=user_input)
        chat.messages.create(text=chat.get_system_message(), role='system', order=0)

    else:
        chat = Chat.objects.get(chat_id=chat_id)
    
    chat.messages.create(text=user_input, role='user', order=chat.messages.count())

    response = chat.get_response()
    return Response({'response': response, 'chat_id': chat.chat_id})