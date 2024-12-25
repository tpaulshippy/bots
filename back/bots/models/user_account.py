from django.contrib.auth.models import User
from django.db import models
from .chat import Chat
from django.utils import timezone

class ModelCost:
    def __init__(self, model_id, input_token_cost, output_token_cost):
        self.model_id = model_id
        self.input_token_cost = input_token_cost
        self.output_token_cost = output_token_cost

    def __str__(self):
        return self.model_id

nova_micro = ModelCost("us.amazon.nova-micro-v1:0", 0.000000035, 0.00000014)
nova_lite = ModelCost("us.amazon.nova-lite-v1:0",   0.00000006,  0.00000024)
costs = { 
    nova_micro.model_id: nova_micro,
    nova_lite.model_id: nova_lite
}

class UserAccount(models.Model):
    user = models.OneToOneField(User, 
                                on_delete=models.CASCADE,
                                related_name='user_account')
    pin = models.IntegerField(null=True)

    def cost_for_today(self, model_id):
        model_cost = costs[model_id]
        return self.input_tokens_today() * model_cost.input_token_cost + self.output_tokens_today() * model_cost.output_token_cost
    
    def input_tokens_today(self):
        chats = Chat.objects.filter(user=self.user, modified_at__date=timezone.now().date())
        return chats.aggregate(models.Sum('input_tokens'))['input_tokens__sum'] or 0
    
    def output_tokens_today(self):
        chats = Chat.objects.filter(user=self.user, modified_at__date=timezone.now().date())
        return chats.aggregate(models.Sum('output_tokens'))['output_tokens__sum'] or 0
