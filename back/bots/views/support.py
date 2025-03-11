from django.conf import settings
from django.shortcuts import render
from django.http import HttpResponse
from django.core.mail import send_mail
from django import forms

class ContactForm(forms.Form):
    name = forms.CharField(label='Name', max_length=100)
    email = forms.EmailField(label='Email')
    subject = forms.CharField(label='Subject', max_length=100)
    message = forms.CharField(label='Message', widget=forms.Textarea)


def support_view(request):
    if request.method == 'POST':
        form = ContactForm(request.POST)
        if form.is_valid():
            # Process the data in form.cleaned_data
            name = form.cleaned_data['name']
            email = form.cleaned_data['email']
            subject = form.cleaned_data['subject']
            message = form.cleaned_data['message']
            
            full_subject = f'Syft Support - {subject}'
            body = f"Name: {name}\nEmail: {email}\nSubject: {subject}\nMessage: {message}"
            
            send_mail(subject=full_subject, 
                      message=body, 
                      from_email=email, 
                      recipient_list=[settings.EMAIL_HOST_USER])
            return HttpResponse('Thank you for your message. We will be in touch shortly.')
    else:
        form = ContactForm()
    return render(request, 'support.html', {'form': form})
