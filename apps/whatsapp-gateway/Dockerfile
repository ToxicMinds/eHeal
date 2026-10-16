FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs filter.mjs ./
# The pairing lives on the machine (a bind mount), so a rebuild keeps the number linked.
VOLUME ["/sessions"]
EXPOSE 8080
USER node
CMD ["node", "server.mjs"]
