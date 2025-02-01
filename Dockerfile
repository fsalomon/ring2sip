# Use an official Node.js 22 image as a base
FROM node:22

# Install FFmpeg and Supervisor
RUN apt-get update && apt-get install -y ffmpeg supervisor && rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json if present
COPY package*.json ./

# Install dependencies (if package.json exists)
RUN if [ -f package.json ]; then npm install; fi

# Copy the rest of the application files
COPY *.js ./
COPY *.opus ./
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expose UDP ports 5080 and 8000
EXPOSE 5080/udp 8000/udp

# Start Supervisord
CMD mkdir -p /var/run
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]

