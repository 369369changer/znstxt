const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
// Node.js 18+ 内置 fetch，无需额外导入

const app = express();
const port = process.env.PORT || 8899;

// 配置 - DeepSeek API
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'YOUR_DEEPSEEK_API_KEY';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS) || 1500;
const TEMPERATURE = parseFloat(process.env.TEMPERATURE) || 0.5;
const TIMEOUT = 30000;

// 调用策略配置
const CALL_STRATEGY = process.env.CALL_STRATEGY || 'smart';

// 解析缓存配置
const CACHE_FILE = path.join(__dirname, 'explanation_cache.json');
let explanationCache = {};
let cacheHitCount = 0;
let apiCallCount = 0;

// 加载缓存文件
function loadCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const data = fs.readFileSync(CACHE_FILE, 'utf8');
            explanationCache = JSON.parse(data);
            console.log(`已加载解析缓存，共 ${Object.keys(explanationCache).length} 条记录`);
        }
    } catch (error) {
        console.error('加载缓存失败:', error);
        explanationCache = {};
    }
}

// 保存缓存到文件
function saveCache() {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(explanationCache, null, 2));
    } catch (error) {
        console.error('保存缓存失败:', error);
    }
}

// 获取解析缓存
function getFromCache(key) {
    return explanationCache[key] || null;
}

// 添加解析到缓存
function addToCache(key, explanation) {
    explanationCache[key] = {
        explanation: explanation,
        timestamp: Date.now(),
        source: explanationCache[key]?.source || 'local'
    };
    saveCache();
}

// 初始化加载缓存
loadCache();

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 专业知识库 - 泵站运行工
const knowledgeBase = {
    '水泵': { 
        description: '水泵是将机械能转换为液体能量的水力机械，通过叶轮旋转产生离心力或轴向推力，实现液体的输送和增压。', 
        field: '水利工程',
        principles: ['离心力原理', '能量转换定律', '伯努利方程'],
        formulas: ['扬程H = (P2-P1)/ρg + (v2²-v1²)/2g + z2-z1']
    },
    '叶轮': { 
        description: '水泵核心旋转部件，由叶片、轮毂和盖板组成，通过高速旋转将机械能传递给液体，使其获得动能和压力能。', 
        field: '机械工程',
        types: ['闭式叶轮', '半开式叶轮', '开式叶轮'],
        materials: ['铸铁', '不锈钢', '青铜']
    },
    '泵壳': { 
        description: '水泵的外壳，将叶轮封闭在内，收集叶轮甩出的液体并引导至出口，同时将部分动能转换为压力能。', 
        field: '机械工程',
        types: ['蜗壳式', '导叶式']
    },
    '轴': { 
        description: '传递动力的部件，连接电机和叶轮，将电机的旋转运动传递给叶轮。', 
        field: '机械工程',
        materials: ['45号钢', '不锈钢']
    },
    '泵站': { 
        description: '安装水泵机组、电气设备和辅助设施的建筑物，是水利工程的重要组成部分，负责供水、排水和调水任务。', 
        field: '水利工程',
        types: ['取水泵站', '送水泵站', '加压泵站', '排涝泵站']
    },
    '泵站设计': { 
        description: '根据供水需求、地形条件和水质要求，确定泵站规模、机组选型和布置方案的过程。', 
        field: '水利工程',
        factors: ['设计流量', '设计扬程', '供水保证率']
    },
    '电机': { 
        description: '将电能转换为机械能的电磁设备，为水泵提供动力，主要由定子、转子、轴承和外壳组成。', 
        field: '电气工程',
        types: ['异步电机', '同步电机', '直流电机'],
        ratings: ['功率', '电压', '电流', '功率因数']
    },
    '异步电动机': { 
        description: '转子转速低于定子旋转磁场转速的交流电动机，结构简单、运行可靠，广泛应用于泵站。', 
        field: '电气工程',
        principles: ['电磁感应', '楞次定律']
    },
    '绝缘等级': { 
        description: '电机绕组绝缘材料的耐热等级，常用等级有A、E、B、F、H级，分别对应不同的最高允许温度。', 
        field: '电气工程',
        levels: { 'A': 105, 'E': 120, 'B': 130, 'F': 155, 'H': 180 }
    },
    '轴承': { 
        description: '支撑旋转轴的部件，减少摩擦、定位旋转部件并承受载荷，分为滚动轴承和滑动轴承两大类。', 
        field: '机械工程',
        types: ['滚动轴承', '滑动轴承'],
        rollingTypes: ['深沟球轴承', '调心滚子轴承', '角接触球轴承']
    },
    '润滑': { 
        description: '在摩擦表面形成油膜，减少磨损、降低温度、防止锈蚀的技术措施。', 
        field: '机械工程',
        types: ['油脂润滑', '油浴润滑', '强制润滑'],
        greases: ['锂基脂', '钙基脂', '钠基脂']
    },
    '扬程': { 
        description: '水泵能够提升液体的高度或增加液体压力的能力，单位为米（m）。', 
        field: '流体力学',
        components: ['吸水扬程', '压水扬程', '损失扬程']
    },
    '流量': { 
        description: '单位时间内通过水泵的液体体积，单位为立方米/秒（m³/s）或升/秒（L/s）。', 
        field: '流体力学',
        measurement: ['电磁流量计', '超声波流量计', '差压流量计']
    },
    '效率': { 
        description: '水泵输出功率与输入功率的比值，反映能量转换的有效程度，通常以百分比表示。', 
        field: '热力学',
        components: ['水力效率', '容积效率', '机械效率']
    },
    '转速': { 
        description: '水泵叶轮每分钟旋转的次数，单位为转/分钟（rpm）。', 
        field: '机械工程',
        relationship: '转速与流量成正比，与扬程成正比'
    },
    '压力': { 
        description: '单位面积上所受的力，单位为帕斯卡（Pa）或兆帕（MPa）。', 
        field: '流体力学',
        relationship: '压力与扬程成正比：P = ρgh'
    },
    '真空度': { 
        description: '低于大气压的程度，用于衡量水泵吸水能力，单位为毫米汞柱（mmHg）或帕斯卡（Pa）。', 
        field: '流体力学',
        limits: ['最大吸上真空高度', '气蚀余量']
    },
    '安装': { 
        description: '将设备固定在基础上并进行找正、找平、灌浆和调试的过程。', 
        field: '工程施工',
        steps: ['基础验收', '设备就位', '找正找平', '二次灌浆', '试运转']
    },
    '检修': { 
        description: '定期检查和维修设备，确保其长期稳定运行的工作。', 
        field: '设备维护',
        types: ['日常检修', '小修', '中修', '大修'],
        cycle: ['月度', '季度', '年度', '三年']
    },
    '找正': { 
        description: '调整设备位置，使机组中心线重合、水平度和垂直度符合要求的过程。', 
        field: '工程施工',
        methods: ['拉线法', '光学准直法', '激光找正法']
    },
    '联轴器': { 
        description: '连接电机轴和水泵轴的部件，传递扭矩并补偿两轴的相对位移。', 
        field: '机械工程',
        types: ['刚性联轴器', '弹性联轴器', '万向联轴器']
    },
    '励磁': { 
        description: '向电机定子或转子提供励磁电流，建立磁场的过程。', 
        field: '电气工程',
        types: ['直流励磁', '交流励磁', '无刷励磁']
    },
    '接地': { 
        description: '将电气设备的金属外壳与大地连接，保障人身安全和设备正常运行的措施。', 
        field: '电气工程',
        types: ['工作接地', '保护接地', '防雷接地']
    },
    '继电保护': { 
        description: '当电气设备发生故障时，自动切断电源以保护设备和人身安全的装置。', 
        field: '电气工程',
        types: ['过流保护', '过压保护', '欠压保护', '差动保护']
    },
    '气蚀': { 
        description: '水泵运行中，由于局部压力低于汽化压力，液体汽化形成气泡，气泡破裂产生冲击和腐蚀的现象。', 
        field: '流体力学',
        causes: ['吸入口压力过低', '流量过大', '安装高度过高'],
        prevention: ['降低安装高度', '增加入口压力', '优化叶轮设计']
    },
    '振动': { 
        description: '设备运行中产生的周期性往复运动，可能由不平衡、不对中、基础松动等原因引起。', 
        field: '机械工程',
        causes: ['转子不平衡', '联轴器不对中', '轴承损坏', '基础共振'],
        measurement: ['振动位移', '振动速度', '振动加速度']
    },
    '噪声': { 
        description: '设备运行产生的声音，超过一定强度会影响环境和人体健康。', 
        field: '声学',
        sources: ['机械噪声', '流体噪声', '电磁噪声'],
        standards: ['工业企业噪声卫生标准']
    },
    '铸铁': { 
        description: '含碳量大于2%的铁碳合金，具有良好的铸造性能和耐磨性，常用于制造泵壳、叶轮等部件。', 
        field: '材料科学',
        types: ['灰铸铁', '球墨铸铁', '可锻铸铁']
    },
    '不锈钢': { 
        description: '含铬量大于12%的合金钢，具有良好的耐腐蚀性，适用于输送腐蚀性介质。', 
        field: '材料科学',
        grades: ['304', '316', '2205']
    },
    '阀门': { 
        description: '控制流体流动的装置，用于开启、关闭和调节管道中的流量和压力。', 
        field: '流体力学',
        types: ['闸阀', '球阀', '蝶阀', '止回阀', '调节阀']
    },
    '管道': { 
        description: '输送液体或气体的通道，由管材、管件和附件组成。', 
        field: '工程施工',
        materials: ['钢管', '铸铁管', '塑料管', '钢筋混凝土管']
    },
    '仪表': { 
        description: '测量和显示设备运行参数的装置，如压力表、温度计、流量计等。', 
        field: '自动化',
        types: ['压力仪表', '温度仪表', '流量仪表', '液位仪表']
    },
    '自动化': { 
        description: '利用计算机和控制技术实现设备自动运行和监控的技术。', 
        field: '自动化',
        components: ['PLC', '传感器', '执行器', '上位机']
    },
    'PLC': { 
        description: '可编程逻辑控制器，用于工业自动化控制的专用计算机。', 
        field: '自动化',
        brands: ['西门子', '施耐德', '欧姆龙', 'AB']
    },
    '计算机网络': { 
        description: '将多台计算机连接起来实现资源共享和数据通信的系统。', 
        field: '计算机',
        protocols: ['TCP/IP', 'MODBUS', 'PROFINET', '以太网']
    },
    'TCP/IP': { 
        description: '传输控制协议/网际协议，是互联网的核心协议，用于计算机之间的通信。', 
        field: '计算机',
        layers: ['物理层', '网络层', '传输层', '应用层']
    }
};

// API路由 - 获取AI解析
app.post('/api/baidu/chat', async (req, res) => {
    try {
        const { messages, temperature = 0.7 } = req.body;
        const prompt = messages[messages.length - 1].content;
        
        const cacheKey = generateCacheKey(prompt);
        const cachedResult = getFromCache(cacheKey);
        if (cachedResult) {
            cacheHitCount++;
            console.log(`缓存命中! 缓存总数: ${cacheHitCount}, API调用: ${apiCallCount}`);
            if (cachedResult.result) {
                return res.json({ result: cachedResult.result });
            }
            if (cachedResult.explanation) {
                return res.json({ result: cachedResult.explanation });
            }
        }
        
        const response = await getDeepSeekExplanation(messages);
        
        if (response.error) {
            const explanation = generateFallbackExplanation(prompt);
            addToCache(cacheKey, explanation);
            return res.json({ result: explanation });
        }
        
        let explanation = '';
        if (response.result) {
            explanation = response.result;
        } else if (response.choices && response.choices[0]?.message?.content) {
            explanation = response.choices[0].message.content;
        } else {
            explanation = generateFallbackExplanation(prompt);
        }
        
        addToCache(cacheKey, explanation);
        apiCallCount++;
        console.log(`API调用成功! 缓存总数: ${cacheHitCount}, API调用: ${apiCallCount}`);
        
        res.json({ result: explanation });
    } catch (error) {
        console.error('调用DeepSeek API失败:', error);
        const prompt = messages[messages.length - 1].content;
        const explanation = generateFallbackExplanation(prompt);
        const cacheKey = generateCacheKey(prompt);
        addToCache(cacheKey, explanation);
        res.json({ result: explanation });
    }
});

// 生成缓存键
function generateCacheKey(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return 'q_' + Math.abs(hash).toString(36);
}

// API路由 - 获取缓存统计
app.get('/api/cache/stats', (req, res) => {
    res.json({
        cacheSize: Object.keys(explanationCache).length,
        cacheHits: cacheHitCount,
        apiCalls: apiCallCount
    });
});

// API路由 - 获取Token（模拟）
app.post('/api/baidu/token', async (req, res) => {
    res.json({ access_token: 'free_token', expires_in: 3600 });
});

// API路由 - 获取解析
app.post('/api/explain', async (req, res) => {
    try {
        const { question, options, answer } = req.body;
        
        const messages = [
            {
                role: 'user',
                content: `请详细解析以下题目：\n\n题目：${question}\n选项：${options.join('、')}\n正确答案：${String.fromCharCode(65 + answer)}. ${options[answer]}\n\n请给出专业的解析说明，包括知识点、原理和答案分析。`
            }
        ];
        
        const explanation = await getDeepSeekExplanation(messages);
        
        return res.json({ success: true, explain: explanation });
    } catch (error) {
        console.error('解析请求失败:', error);
        const prompt = `题目：${question}\n选项：${options.join('、')}\n正确答案：${String.fromCharCode(65 + answer)}. ${options[answer]}`;
        res.json({ success: true, explain: generateFallbackExplanation(prompt) });
    }
});

// 使用DeepSeek API获取解析
async function getDeepSeekExplanation(messages) {
    const prompt = messages[messages.length - 1].content;
    
    if (CALL_STRATEGY === 'local_only') {
        console.log('调用策略: 仅本地解析');
        return { result: generateFallbackExplanation(prompt) };
    }
    
    if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'YOUR_DEEPSEEK_API_KEY') {
        console.log('未配置API Key，使用本地解析');
        return { result: generateFallbackExplanation(prompt) };
    }
    
    try {
        console.log(`调用策略: ${CALL_STRATEGY}，使用DeepSeek API (模型: ${DEEPSEEK_MODEL}, max_tokens: ${MAX_TOKENS})`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
        
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: DEEPSEEK_MODEL,
                messages: messages,
                temperature: TEMPERATURE,
                max_tokens: MAX_TOKENS,
                stream: false,
                presence_penalty: 0,
                frequency_penalty: 0
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const data = await response.json();
        console.log('DeepSeek API响应:', data);
        
        if (data.error) {
            console.warn('DeepSeek API错误:', data.error);
            
            if (CALL_STRATEGY === 'api_only') {
                return { error: data.error };
            }
            
            return { result: generateFallbackExplanation(prompt) };
        }
        
        return data;
    } catch (error) {
        console.error('DeepSeek API调用失败:', error);
        
        if (CALL_STRATEGY === 'api_only') {
            return { error: { message: 'API调用失败' } };
        }
        
        return { result: generateFallbackExplanation(prompt) };
    }
}

// 生成专业解析
function generateFallbackExplanation(prompt) {
    const keywords = extractKeywords(prompt);
    
    if (keywords.length > 0) {
        const mainKeyword = keywords[0];
        const knowledge = knowledgeBase[mainKeyword];
        
        let explanation = `【专业解析】\n\n`;
        
        explanation += `一、考点分析：\n`;
        explanation += `本题主要考察"${mainKeyword}"相关知识，属于${knowledge?.field || '水利工程'}领域的基础/专业考点。\n\n`;
        
        explanation += `二、核心知识：\n`;
        explanation += `${knowledge?.description || `请掌握${mainKeyword}的基本概念和工作原理。`}\n\n`;
        
        if (knowledge?.principles && knowledge.principles.length > 0) {
            explanation += `相关原理：${knowledge.principles.join('、')}\n`;
        }
        if (knowledge?.formulas && knowledge.formulas.length > 0) {
            explanation += `核心公式：${knowledge.formulas.join('；')}\n\n`;
        }
        
        if (knowledge?.types && knowledge.types.length > 0) {
            explanation += `主要类型：${knowledge.types.join('、')}\n\n`;
        }
        
        if (knowledge?.materials && knowledge.materials.length > 0) {
            explanation += `常用材料：${knowledge.materials.join('、')}\n\n`;
        }
        
        explanation += `三、答案分析：\n`;
        explanation += `根据${mainKeyword}的基本原理和特性，正确答案符合相关专业知识。\n\n`;
        
        explanation += `四、答题技巧：\n`;
        explanation += `1. 掌握${mainKeyword}的基本定义和核心概念\n`;
        explanation += `2. 理解其工作原理和性能特点\n`;
        explanation += `3. 结合选项分析，排除明显错误答案\n`;
        explanation += `4. 注意题目中的关键词和限定条件\n\n`;
        
        explanation += `五、拓展学习：\n`;
        explanation += `建议深入学习《泵站运行工》相关教材，重点掌握${mainKeyword}在实际工程中的应用。\n`;
        explanation += `参考相关国家标准和行业规范，加深理论联系实际的能力。`;
        
        return explanation;
    }
    
    return `【专业解析】\n\n一、考点分析：本题涉及泵站运行工专业知识。\n\n二、核心知识：请结合教材内容理解相关概念。\n\n三、答案分析：根据专业知识判断，正确答案符合相关理论。\n\n四、答题技巧：认真审题，结合所学知识进行分析判断。\n\n五、拓展学习：建议系统学习泵站运行相关专业课程。`;
}

// 提取关键词
function extractKeywords(text) {
    const keywords = [];
    Object.keys(knowledgeBase).forEach(keyword => {
        if (text.includes(keyword)) {
            keywords.push(keyword);
        }
    });
    return [...new Set(keywords)].slice(0, 3);
}

// 健康检查
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// 处理根路径，返回前端页面
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务器
app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
    if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'YOUR_DEEPSEEK_API_KEY') {
        console.log('提示：未配置DeepSeek API Key，使用本地解析模式。如需更专业的解析，请配置API Key。');
    }
});

// Vercel Serverless Function 支持
module.exports = app;
