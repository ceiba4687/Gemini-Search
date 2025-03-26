import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Key, Eye, EyeOff, Check } from 'lucide-react';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from '@/components/ui/popover';
import { toast } from '@/hooks/use-toast';

const LOCAL_STORAGE_KEY = 'gemini-search-api-key';

interface ApiKeyInputProps {
  onApiKeyChange?: (apiKey: string | null) => void;
}

export function ApiKeyInput({ onApiKeyChange }: ApiKeyInputProps) {
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [isStored, setIsStored] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  // 只在组件挂载时加载一次API key
  useEffect(() => {
    const storedKey = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (storedKey) {
      setApiKey(storedKey);
      setIsStored(true);
      // 只在初始化时调用一次onApiKeyChange，避免循环
      if (onApiKeyChange) {
        onApiKeyChange(storedKey);
      }
    }
  }, []);  // 空依赖数组，确保只在挂载时执行

  const handleSaveKey = () => {
    if (!apiKey.trim()) {
      toast({
        title: "错误",
        description: "API Key 不能为空",
        variant: "destructive",
      });
      return;
    }

    localStorage.setItem(LOCAL_STORAGE_KEY, apiKey);
    setIsStored(true);
    setIsOpen(false);
    
    if (onApiKeyChange) {
      onApiKeyChange(apiKey);
    }
    
    toast({
      title: "成功",
      description: "API Key 已保存",
    });
  };

  const handleClearKey = () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    setApiKey('');
    setIsStored(false);
    setIsOpen(false);
    
    if (onApiKeyChange) {
      onApiKeyChange(null);
    }
    
    toast({
      title: "已清除",
      description: "API Key 已移除",
    });
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant={isStored ? "outline" : "default"}
          size="sm"
          className="gap-1.5"
        >
          <Key className="h-3.5 w-3.5" />
          {isStored ? "API Key 已设置" : "设置 API Key"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Google API Key</h4>
            <p className="text-sm text-muted-foreground">
              输入您自己的 Google Gemini API Key 以使用该搜索服务
            </p>
          </div>
          <div className="grid gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="apiKey">API Key</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  type={showApiKey ? "text" : "password"}
                  placeholder="输入 Google API Key..."
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="flex justify-between mt-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleClearKey} 
                disabled={!isStored}
              >
                清除
              </Button>
              <Button onClick={handleSaveKey} size="sm" className="gap-1.5">
                <Check className="h-3.5 w-3.5" />
                保存
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}