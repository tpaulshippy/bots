from datetime import datetime, time
from django.contrib.auth.models import User
from django.db import models
from .chat import Chat
from .ai_model import AiModel
from django.utils import timezone
import pytz

MAX_COST_DAILY = {
    0: 0.01 / 31,
    1: 1.0 / 31,
    2: 5.0 / 31,
}

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
            UsageLimitHit.objects.create(user_account=self,
                                         subscription_level=self.subscription_level,
                                         total_input_tokens=total_input_tokens,
                                         total_output_tokens=total_output_tokens)
            return True
        return False

    def cost_for_today(self):
        supported_models = AiModel.objects.all()
        total = 0.0
        total_input_tokens = 0
        total_output_tokens = 0
        for model in supported_models:
            input_tokens = self.input_tokens_today(model.model_id)
            output_tokens = self.output_tokens_today(model.model_id)
            total += input_tokens * model.input_token_cost + output_tokens * model.output_token_cost
            total_input_tokens += input_tokens
            total_output_tokens += output_tokens
            
            if model.is_default:
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