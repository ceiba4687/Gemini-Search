import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { SearchInput } from '@/components/SearchInput';
import { SearchResults } from '@/components/SearchResults';
import { FollowUpInput } from '@/components/FollowUpInput';
import { ApiKeyInput } from '@/components/ApiKeyInput';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SourceList } from '@/components/SourceList';

export function Search() {
  const [location, setLocation] = useLocation();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentResults, setCurrentResults] = useState<any>(null);
  const [originalQuery, setOriginalQuery] = useState<string | null>(null);
  const [isFollowUp, setIsFollowUp] = useState(false);
  const [followUpQuery, setFollowUpQuery] = useState<string | null>(null);
  const [customApiKey, setCustomApiKey] = useState<string | null>(null);
  const [needsApiKey, setNeedsApiKey] = useState(false);
  
  // 提取URL中的查询参数
  const getQueryFromUrl = () => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get('q') || '';
  };
  
  const [searchQuery, setSearchQuery] = useState(getQueryFromUrl);
  const [refetchCounter, setRefetchCounter] = useState(0);

  // 添加自定义API Key到请求
  const appendApiKey = (url: string) => {
    if (!customApiKey) return url;
    return `${url}${url.includes('?') ? '&' : '?'}apiKey=${encodeURIComponent(customApiKey)}`;
  };

  // 修改useQuery依赖关系处理
  const { data, isLoading, error } = useQuery({
    queryKey: ['search', searchQuery, refetchCounter], // 移除customApiKey依赖
    queryFn: async () => {
      if (!searchQuery) return null;
      const url = appendApiKey(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      const response = await fetch(url);
      
      const result = await response.json();
      
      // 处理API密钥错误
      if (!response.ok) {
        if (result.requiresApiKey) {
          // 可以在这里设置一个状态来显示API密钥输入表单
          setNeedsApiKey(true);
          throw new Error(result.message || 'API key required');
        }
        throw new Error(result.message || 'Search failed');
      }
      
      console.log('Search API Response:', JSON.stringify(result, null, 2));
      if (result.sessionId) {
        setSessionId(result.sessionId);
        setCurrentResults(result);
        if (!originalQuery) {
          setOriginalQuery(searchQuery);
        }
        setIsFollowUp(false);
      }
      return result;
    },
    enabled: !!searchQuery,
  });

  // Follow-up mutation
  const followUpMutation = useMutation({
    mutationFn: async (followUpQuery: string) => {
      if (!sessionId) {
        const url = appendApiKey(`/api/search?q=${encodeURIComponent(followUpQuery)}`);
        const response = await fetch(url);
        if (!response.ok) throw new Error('Search failed');
        const result = await response.json();
        console.log('New Search API Response:', JSON.stringify(result, null, 2));
        if (result.sessionId) {
          setSessionId(result.sessionId);
          setOriginalQuery(searchQuery);
          setIsFollowUp(false);
        }
        return result;
      }

      const response = await fetch(appendApiKey('/api/follow-up'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          query: followUpQuery,
          apiKey: customApiKey || undefined,
        }),
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          const newUrl = appendApiKey(`/api/search?q=${encodeURIComponent(followUpQuery)}`);
          const newResponse = await fetch(newUrl);
          if (!newResponse.ok) throw new Error('Search failed');
          const result = await newResponse.json();
          console.log('Fallback Search API Response:', JSON.stringify(result, null, 2));
          if (result.sessionId) {
            setSessionId(result.sessionId);
            setOriginalQuery(searchQuery);
            setIsFollowUp(false);
          }
          return result;
        }
        throw new Error('Follow-up failed');
      }
      
      const result = await response.json();
      console.log('Follow-up API Response:', JSON.stringify(result, null, 2));
      return result;
    },
    onSuccess: (result) => {
      setCurrentResults(result);
      setIsFollowUp(true);
    },
  });

  const handleSearch = async (newQuery: string) => {
    if (newQuery === searchQuery) {
      setRefetchCounter(c => c + 1);
    } else {
      setSessionId(null);
      setOriginalQuery(null);
      setIsFollowUp(false);
      setSearchQuery(newQuery);
    }
    const newUrl = `/search?q=${encodeURIComponent(newQuery)}`;
    window.history.pushState({}, '', newUrl);
  };

  const handleFollowUp = async (newFollowUpQuery: string) => {
    setFollowUpQuery(newFollowUpQuery);
    await followUpMutation.mutateAsync(newFollowUpQuery);
  };

  // 修改handleApiKeyChange函数来防止循环
  const handleApiKeyChange = (apiKey: string | null) => {
    // 避免重复设置相同的值
    if (apiKey === customApiKey) return;
    
    setCustomApiKey(apiKey);
    setSessionId(null); // 清除会话
    
    // 只有当有搜索查询并且之前有结果时才重新搜索
    if (searchQuery && (data || currentResults)) {
      // 使用setTimeout分离状态更新和重新获取
      setTimeout(() => {
        setRefetchCounter(c => c + 1);
      }, 0);
    }
  };

  // 监听URL变化
  useEffect(() => {
    const query = getQueryFromUrl();
    if (query && query !== searchQuery) {
      setSessionId(null);
      setOriginalQuery(null);
      setIsFollowUp(false);
      setSearchQuery(query);
    }
  }, [location]);

  const displayResults = currentResults || data;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen bg-background"
    >
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="max-w-6xl mx-auto p-4"
      >
        <motion.div 
          className="flex items-center gap-4 mb-6"
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/')}
            className="hidden sm:flex"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="w-full max-w-2xl">
            <SearchInput
              onSearch={handleSearch}
              initialValue={searchQuery}
              isLoading={isLoading}
              autoFocus={false}
              large={false}
            />
          </div>
          
          {/* API Key 按钮 */}
          <div className="hidden sm:block">
            <ApiKeyInput onApiKeyChange={handleApiKeyChange} />
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={searchQuery}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-stretch"
          >
            {/* 移动端显示API Key按钮 */}
            <div className="block sm:hidden mb-3">
              <ApiKeyInput onApiKeyChange={handleApiKeyChange} />
            </div>
            
            <SearchResults
              query={isFollowUp ? (followUpQuery || '') : searchQuery}
              results={displayResults}
              isLoading={isLoading || followUpMutation.isPending}
              error={error || followUpMutation.error || undefined}
              isFollowUp={isFollowUp}
              originalQuery={originalQuery || ''}
            />

            {displayResults && !isLoading && !followUpMutation.isPending && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                className="mt-6 max-w-2xl"
              >
                <FollowUpInput
                  onSubmit={handleFollowUp}
                  isLoading={followUpMutation.isPending}
                />
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}