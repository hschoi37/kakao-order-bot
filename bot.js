const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// CORS 허용 설정
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

console.log('🎉 카카오톡 주문봇을 시작합니다!');

// 환경변수 확인
const requiredEnvs = ['TARGET_CHATROOM'];
const optionalEnvs = [
    'KAKAO_EMAIL', 'KAKAO_PASSWORD', 'DEVICE_ID', 'OPENCHAT_LINKS', // node-kakao용
    'KAKAO_REST_API_KEY', 'KAKAO_TEMPLATE_ID', 'TARGET_PHONE_NUMBER', // 비즈니스 API용
    'KAKAO_WORK_BOT_KEY', 'KAKAO_WORK_CONVERSATION_ID' // 카카오워크용
];

const missingRequired = requiredEnvs.filter(env => !process.env[env]);
const availableOptional = optionalEnvs.filter(env => !!process.env[env]);

console.log('🔧 환경변수 상태:');
console.log(`   필수: ${missingRequired.length === 0 ? '✅ 완료' : '❌ 누락'}`);
console.log(`   선택: ${availableOptional.length}개 설정됨`);

// 봇 상태 변수
let isLoggedIn = false;
let loginAttempts = 0;
let chatrooms = {};
let startTime = Date.now();
let kakaoClient = null;
let connectionStatus = '준비중';
let lastError = null;
let sendingMethod = 'simulation'; // simulation, node-kakao, business-api, kakao-work

// 전송 방법 결정
function determineSendingMethod() {
    if (process.env.KAKAO_REST_API_KEY && process.env.KAKAO_TEMPLATE_ID) {
        sendingMethod = 'business-api';
        console.log('📱 전송 방법: 카카오톡 비즈니스 API (알림톡)');
    } else if (process.env.KAKAO_WORK_BOT_KEY) {
        sendingMethod = 'kakao-work';
        console.log('💼 전송 방법: 카카오워크 API');
    } else if (process.env.KAKAO_EMAIL && process.env.KAKAO_PASSWORD) {
        sendingMethod = 'node-kakao';
        console.log('🔧 전송 방법: node-kakao 라이브러리');
    } else {
        sendingMethod = 'simulation';
        console.log('🎭 전송 방법: 시뮬레이션 모드');
    }
    return sendingMethod;
}

// 카카오톡 비즈니스 API (알림톡) 전송
async function sendBusinessAPI(message) {
    try {
        const phoneNumber = process.env.TARGET_PHONE_NUMBER;
        if (!phoneNumber) {
            throw new Error('TARGET_PHONE_NUMBER가 설정되지 않았습니다');
        }

        const templateArgs = {
            주문자명: message.match(/(.+)님의 주문이/)?.[1] || '고객',
            주문내용: message.split('\n').slice(1).join('\n')
        };

        const response = await axios.post(
            'https://kapi.kakao.com/v2/alimtalk/send',
            {
                template_id: process.env.KAKAO_TEMPLATE_ID,
                receiver_id: phoneNumber,
                template_args: templateArgs
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.KAKAO_REST_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ 알림톡 전송 성공');
        return { success: true, method: 'business-api' };
    } catch (error) {
        console.log('❌ 알림톡 전송 실패:', error.response?.data || error.message);
        return { success: false, method: 'business-api', error: error.message };
    }
}

// 카카오워크 API 전송
async function sendKakaoWork(message) {
    try {
        const conversationId = process.env.KAKAO_WORK_CONVERSATION_ID;
        if (!conversationId) {
            throw new Error('KAKAO_WORK_CONVERSATION_ID가 설정되지 않았습니다');
        }

        const response = await axios.post(
            `https://api.kakaowork.com/v1/conversations/${conversationId}/messages`,
            {
                text: message,
                blocks: [
                    {
                        type: "section",
                        text: {
                            type: "plain_text",
                            text: message
                        }
                    }
                ]
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.KAKAO_WORK_BOT_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ 카카오워크 메시지 전송 성공');
        return { success: true, method: 'kakao-work' };
    } catch (error) {
        console.log('❌ 카카오워크 전송 실패:', error.response?.data || error.message);
        return { success: false, method: 'kakao-work', error: error.message };
    }
}

// node-kakao 라이브러리 연결 시도
async function attemptNodeKakaoConnection() {
    try {
        const nodeKakao = require('node-kakao');
        console.log('📦 node-kakao 라이브러리 발견!');
        
        kakaoClient = new nodeKakao.TalkClient();
        
        const loginResult = await kakaoClient.login({
            email: process.env.KAKAO_EMAIL,
            password: process.env.KAKAO_PASSWORD,
            deviceName: process.env.DEVICE_ID || 'railway-bot',
            forced: true
        });

        if (loginResult.success) {
            console.log('✅ node-kakao 로그인 성공!');
            isLoggedIn = true;
            connectionStatus = 'node-kakao 연결됨';
            await loadNodeKakaoChannels();
            return true;
        } else {
            throw new Error(`로그인 실패: ${loginResult.status}`);
        }
    } catch (libError) {
        console.log('📦 node-kakao 라이브러리가 설치되지 않았거나 연결 실패');
        console.log('💡 설치 방법: npm install node-kakao');
        return false;
    }
}

// node-kakao 채널 로드
async function loadNodeKakaoChannels() {
    try {
        const channelList = kakaoClient.ChannelManager.getAllChannels();
        chatrooms = {};
        
        channelList.forEach(channel => {
            chatrooms[channel.info.name] = {
                id: channel.info.channelId,
                name: channel.info.name,
                type: channel.info.type,
                memberCount: channel.info.memberCount || 0
            };
        });
        
        console.log(`✅ ${Object.keys(chatrooms).length}개 채팅방 로드 완료`);
    } catch (error) {
        console.log(`❌ 채널 로드 실패: ${error.message}`);
    }
}

// node-kakao 메시지 전송
async function sendNodeKakao(chatRoomName, message) {
    try {
        if (!kakaoClient || !isLoggedIn) {
            throw new Error('node-kakao 로그인이 필요합니다');
        }
        
        const chatroom = chatrooms[chatRoomName];
        if (!chatroom) {
            throw new Error(`채팅방을 찾을 수 없습니다: ${chatRoomName}`);
        }
        
        const channel = kakaoClient.ChannelManager.get(chatroom.id);
        if (!channel) {
            throw new Error(`채널에 접근할 수 없습니다: ${chatRoomName}`);
        }
        
        const sendResult = await channel.sendText(message);
        
        if (sendResult.success) {
            console.log(`✅ node-kakao 메시지 전송 성공: ${chatRoomName}`);
            return { success: true, method: 'node-kakao' };
        } else {
            throw new Error(`전송 실패: ${sendResult.status}`);
        }
    } catch (error) {
        console.log(`❌ node-kakao 전송 실패: ${error.message}`);
        return { success: false, method: 'node-kakao', error: error.message };
    }
}

// 시뮬레이션 전송
async function sendSimulation(chatRoomName, message) {
    console.log(`🎭 [시뮬레이션] ${chatRoomName}에 메시지 전송:`);
    console.log(message);
    console.log('---');
    return { success: true, method: 'simulation' };
}

// 통합 메시지 전송 함수
async function sendOrderMessage(chatRoomName, message) {
    const method = determineSendingMethod();
    
    let result;
    switch (method) {
        case 'business-api':
            result = await sendBusinessAPI(message);
            break;
        case 'kakao-work':
            result = await sendKakaoWork(message);
            break;
        case 'node-kakao':
            result = await sendNodeKakao(chatRoomName, message);
            break;
        default:
            result = await sendSimulation(chatRoomName, message);
    }
    
    return result;
}

// 초기화 함수
async function initializeBot() {
    const method = determineSendingMethod();
    
    if (method === 'node-kakao') {
        const success = await attemptNodeKakaoConnection();
        if (!success) {
            sendingMethod = 'simulation';
            connectionStatus = 'node-kakao 실패, 시뮬레이션 모드';
        }
    } else if (method === 'simulation') {
        // 시뮬레이션 채팅방 생성
        chatrooms = {
            [process.env.TARGET_CHATROOM]: {
                id: 'simulated_room_001',
                name: process.env.TARGET_CHATROOM,
                type: 'SIMULATION',
                memberCount: 1,
                isSimulated: true
            }
        };
        connectionStatus = '시뮬레이션 모드';
        isLoggedIn = true;
    } else {
        connectionStatus = `${method} 준비 완료`;
        isLoggedIn = true;
    }
}

// 웹 API들
app.get('/', (req, res) => {
    res.json({
        상태: '카카오톡 주문봇이 정상 작동중입니다! 🤖',
        전송방법: sendingMethod,
        연결상태: connectionStatus,
        지원방법: {
            'business-api': !!process.env.KAKAO_REST_API_KEY,
            'kakao-work': !!process.env.KAKAO_WORK_BOT_KEY,
            'node-kakao': !!(process.env.KAKAO_EMAIL && process.env.KAKAO_PASSWORD),
            'simulation': true
        },
        채팅방수: Object.keys(chatrooms).length,
        실행시간: `${Math.floor((Date.now() - startTime) / 1000)}초`,
        서버시간: new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'})
    });
});

// 주문 알림 API
app.post('/order', async (req, res) => {
    try {
        const { 주문자, 상품목록 } = req.body;
        
        if (!주문자 || !상품목록) {
            return res.status(400).json({
                error: '필수 정보가 누락되었습니다',
                필수: ['주문자', '상품목록']
            });
        }
        
        const orderMessage = `${주문자}님의 주문이 완료되었습니다
${상품목록}`;

        console.log('📬 주문 알림 생성:');
        console.log(orderMessage);
        
        const result = await sendOrderMessage(process.env.TARGET_CHATROOM, orderMessage);
        
        res.json({
            message: result.success ? '주문 알림이 전송되었습니다! ✅' : '메시지 전송에 실패했습니다 ❌',
            주문정보: { 주문자, 상품목록 },
            전송시간: new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}),
            전송방법: result.method,
            전송성공: result.success,
            생성된메시지: orderMessage,
            오류: result.error || null
        });
        
    } catch (error) {
        console.log(`❌ 주문 처리 중 오류: ${error.message}`);
        res.status(500).json({
            error: '주문 처리 중 오류가 발생했습니다',
            details: error.message
        });
    }
});

// 전송 방법 변경 API
app.post('/change-method', async (req, res) => {
    const { method } = req.body;
    const validMethods = ['simulation', 'node-kakao', 'business-api', 'kakao-work'];
    
    if (!validMethods.includes(method)) {
        return res.status(400).json({
            error: '잘못된 전송 방법입니다',
            사용가능한방법: validMethods
        });
    }
    
    sendingMethod = method;
    await initializeBot();
    
    res.json({
        message: `전송 방법이 ${method}로 변경되었습니다`,
        현재방법: sendingMethod,
        연결상태: connectionStatus
    });
});

// 전송 방법 상태 API
app.get('/methods', (req, res) => {
    res.json({
        현재방법: sendingMethod,
        지원방법: {
            'simulation': {
                사용가능: true,
                설명: '시뮬레이션 모드 (로그만 출력)',
                필요환경변수: []
            },
            'node-kakao': {
                사용가능: !!(process.env.KAKAO_EMAIL && process.env.KAKAO_PASSWORD),
                설명: 'node-kakao 라이브러리 (개인 계정)',
                필요환경변수: ['KAKAO_EMAIL', 'KAKAO_PASSWORD', 'DEVICE_ID']
            },
            'business-api': {
                사용가능: !!(process.env.KAKAO_REST_API_KEY && process.env.KAKAO_TEMPLATE_ID),
                설명: '카카오톡 비즈니스 API (알림톡)',
                필요환경변수: ['KAKAO_REST_API_KEY', 'KAKAO_TEMPLATE_ID', 'TARGET_PHONE_NUMBER']
            },
            'kakao-work': {
                사용가능: !!process.env.KAKAO_WORK_BOT_KEY,
                설명: '카카오워크 API',
                필요환경변수: ['KAKAO_WORK_BOT_KEY', 'KAKAO_WORK_CONVERSATION_ID']
            }
        }
    });
});

// 기존 API들 (상태, 테스트 등)
app.get('/status', (req, res) => {
    res.json({
        전송방법: sendingMethod,
        연결상태: connectionStatus,
        로그인상태: isLoggedIn,
        채팅방수: Object.keys(chatrooms).length,
        실행시간_초: Math.floor((Date.now() - startTime) / 1000),
        현재시간: new Date().toISOString()
    });
});

app.get('/test', (req, res) => {
    res.json({
        message: '테스트 성공! 🎉',
        전송방법: sendingMethod,
        연결상태: connectionStatus,
        시간: new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'})
    });
});

// 서버 시작
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 웹서버가 ${PORT}번 포트에서 실행중입니다!`);
    console.log('🚀 카카오톡 주문봇 v5 시작!');
    
    // 봇 초기화
    setTimeout(initializeBot, 3000);
});

// 정상 종료 처리
process.on('SIGTERM', () => {
    console.log('📴 서버가 종료됩니다...');
    if (kakaoClient) {
        kakaoClient.close();
    }
    process.exit(0);
});
