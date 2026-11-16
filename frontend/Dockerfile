FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# --host 0.0.0.0: Vite's dev server binds localhost by default, which is
# unreachable from outside the container.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
