from django.shortcuts import render
from django.http import HttpResponse
from django.core.mail import send_mail
from django import forms

class ContactForm(forms.Form):
    name = forms.CharField(label='Your Name', max_length=100)
    email = forms.EmailField(label='Your Email')
    message = forms.CharField(label='Message', widget=forms.Textarea)


def support_view(request):
    if request.method == 'POST':
        form = ContactForm(request.POST)
        if form.is_valid():
            # Process the data in form.cleaned_data
            name = form.cleaned_data['name']
            email = form.cleaned_data['email']
            message = form.cleaned_data['message']
            send_mail(f'Contact Form Submission from {name}', message, email, ['pshippy@gmail.com'])
            return HttpResponse('Thank you for your message!')
    else:
        form = ContactForm()
    return render(request, 'support.html', {'form': form})
