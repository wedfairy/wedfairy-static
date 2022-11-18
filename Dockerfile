FROM nginx:latest

ADD fonts /usr/share/nginx/html/fonts
ADD images /usr/share/nginx/html/images
ADD javascripts /usr/share/nginx/html/javascripts
ADD stylesheets /usr/share/nginx/html/stylesheets
ADD error.html /usr/share/nginx/html/error.html
