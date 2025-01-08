from datetime import datetime, time
from django.contrib.auth.models import User
from django.db import models
from .chat import DEFAULT_MODEL_ID, Chat
from django.utils import timezone
import pytz

MAX_COST_DAILY = {
    0: 0.01 / 31,
    1: 1.0 / 31,
    2: 5.0 / 31,
}

class ModelCost:
    def __init__(self, model_id, input_token_cost, output_token_cost):
        self.model_id = model_id
        self.input_token_cost = input_token_cost
        self.output_token_cost = output_token_cost

    def __str__(self):
        return self.model_id

nova_micro = ModelCost("us.amazon.nova-micro-v1:0",                     0.000000035, 0.00000014)
nova_lite = ModelCost("us.amazon.nova-lite-v1:0",                       0.00000006,  0.00000024)
nova_pro = ModelCost("us.amazon.nova-pro-v1:0",                         0.0000008,   0.0000032)
llama33 = ModelCost("meta.llama3-3-70b-instruct-v1:0",                  0.00000072,  0.00000072)
claude3haiku = ModelCost("anthropic.claude-3-haiku-20240307-v1:0",      0.0000008,   0.000004)
claude35haiku = ModelCost("anthropic.claude-3-5-haiku-20241022-v1:0",   0.00000025,  0.00000125)
supported_models = [nova_micro, nova_lite, nova_pro, llama33, claude3haiku, claude35haiku]

class UserAccount(models.Model):
    user = models.OneToOneField(User, 
                                on_delete=models.CASCADE,
                                related_name='user_account')
    pin = models.IntegerField(null=True)
    subscription_level = models.IntegerField(default=0)
    timezone = models.CharField(max_length=50, default='UTC')
    
    def __str__(self):
        return self.user.email

    def over_limit(self):
        from .usage_limit_hit import UsageLimitHit
        total, total_input_tokens, total_output_tokens = self.cost_for_today()
        if total >= MAX_COST_DAILY[self.subscription_level]:
            print("over_limit")
            UsageLimitHit.objects.create(user_account=self,
                                         subscription_level=self.subscription_level,
                                         total_input_tokens=total_input_tokens,
                                         total_output_tokens=total_output_tokens)
            return True
        return False

    def cost_for_today(self):
        total = 0.0
        total_input_tokens = 0
        total_output_tokens = 0
        for model in supported_models:
            input_tokens = self.input_tokens_today(model.model_id)
            output_tokens = self.output_tokens_today(model.model_id)
            total += input_tokens * model.input_token_cost + output_tokens * model.output_token_cost
            total_input_tokens += input_tokens
            total_output_tokens += output_tokens
            
            if model.model_id == DEFAULT_MODEL_ID:
                # Add costs for chats with no specified bot (using the default model)
                input_tokens = self.input_tokens_today(None)
                output_tokens = self.output_tokens_today(None)
                total += input_tokens * model.input_token_cost + output_tokens * model.output_token_cost
                total_input_tokens += input_tokens
                total_output_tokens += output_tokens

        return total, total_input_tokens, total_output_tokens
    
    def input_tokens_today(self, model_id):
        chats = self.chats_today(model_id)
        return chats.aggregate(models.Sum('input_tokens'))['input_tokens__sum'] or 0
    
    def output_tokens_today(self, model_id):
        chats = self.chats_today(model_id)
        return chats.aggregate(models.Sum('output_tokens'))['output_tokens__sum'] or 0
        
    def chats_today(self, model_id):
        user_timezone = pytz.timezone(self.timezone)
        today = timezone.now().astimezone(user_timezone).date()
        start_of_day = user_timezone.localize(datetime.combine(today, time.min))
        start_of_day_utc = start_of_day.astimezone(pytz.UTC)
        return Chat.objects.filter(user=self.user,
                                    bot__model=model_id,
                                    modified_at__gte=start_of_day_utc)