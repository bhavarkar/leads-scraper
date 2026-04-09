# Specify the parent image from which we build
FROM apify/actor-node:18

# Copy executable and settings
COPY package*.json ./

# Install only production dependencies
RUN npm --quiet set progress=false \
    && npm install --only=prod --no-optional \
    && echo "Installed NPM packages:" \
    && (npm list --all || true) \
    && echo "---"

# Copy rest of the files
COPY . ./

# Run the command to start the actor
CMD ["npm", "start"]
