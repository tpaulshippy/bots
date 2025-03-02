from django.shortcuts import render

def auto_google_login(request):
    return render(request, 'auto_google_login.html') 

def auto_apple_login(request):
    return render(request, 'auto_apple_login.html')
