import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");

export function setupEnvironment() {
  const result = dotenv.config({ path: envPath });
  // 如果找不到.env文件，只记录警告而不是抛出错误
  if (result.error) {
    console.warn(`No .env file found at ${envPath} or there was an error loading it: ${result.error.message}`);
  }

  // 移除强制检查GOOGLE_API_KEY是否存在
  // 返回环境变量，即使GOOGLE_API_KEY不存在
  return {
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || "",
    NODE_ENV: process.env.NODE_ENV || "development",
  };
}
