# Use official Node.js 18 (Alpine for smaller size)
FROM node:18-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install dependencies (only production if you prefer, but standard install is safer for dev tools needed at runtime)
# Using ci for cleaner install based on lockfile
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# Expose the API port
EXPOSE 6000

# Define the command to run the app
CMD ["npm", "start"]
