from django.views.generic import TemplateView

class MarketingPageView(TemplateView):
    template_name = 'marketing.html'  # Ensure you have a template named marketing.html

class TutorialView(TemplateView):
    template_name = 'tutorial.html'
