FROM node:20-slim
WORKDIR /app
COPY . /app
RUN ls -al /app
RUN mkdir config
COPY w_env.ts /app/server/env.ts

# 设置生产环境
ENV NODE_ENV=production

# 安装依赖
RUN npm install

# 构建生产版本
RUN npm run build

# 暴露端口
EXPOSE 3000

# 启动生产服务器
CMD ["npm", "run", "start"]
