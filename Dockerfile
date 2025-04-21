FROM node:20-slim

# 安装必要的构建工具
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装所有依赖（包括开发依赖，因为需要构建）
RUN npm install

# 复制源代码
COPY . .

# 创建必要的目录
RUN mkdir -p config
COPY w_env.ts /app/server/env.ts

# 设置生产环境
ENV NODE_ENV=production

# 构建前端
RUN npm run build

# 暴露端口
EXPOSE 3000

# 启动生产服务器
CMD ["npm", "run", "start"]
