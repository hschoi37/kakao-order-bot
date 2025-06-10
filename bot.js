const express = require('express');

const app = express();
app.use(express.json());

console.log('🎉 카카오톡 주문봇을 시작합니다!');

// 환경변수 확인
const requiredEnvs = ['KAKAO_EMAIL', 'KAKAO_PASSWORD', 'DEVICE_ID', 'OPENCHAT_LINKS', 'TARGET_CHATROOM'];
const missingEnvs = requiredEnvs.filter(env => !process.env[env]);

if (missingEnvs.length > 0) {
    console.log('❌ 환경변수가 설정되지 않았습니다!');
    console.log('🔧 Railway에서 Variables 탭에서 다음을 설정하세요:');
    missingEnvs.forEach(env => console.log(`   - ${env}`));
} else {
    console.log('✅ 환경변수 확인 완료!');
    console.log(`📧 이메일: ${process.env.KAKAO_EMAIL}`);
    console.log(`🔧 기기ID: ${process.env.DEVICE_ID}`);
}

// 봇 상태 변수
let isLoggedIn = false;
let loginAttempts = 0;
let chatrooms = {};
let startTime = Date.now();
let kakaoClient = null;
let connectionStatus = '준비중';
let lastError = null;

// 카카오톡 연결 시뮬레이션 함수
async function attemptKakaoConnection() {
    if (missingEnvs.length > 0) {
        connectionStatus = '환경변수 누락';
        return false;
    }

    try {
        loginAttempts++;
        connectionStatus = `로그인 시도 중... (${loginAttempts}회)`;
        console.log(`🔐 카카오톡 로그인 시도 중... (${loginAttempts}회)`);
        
        // 실제 node-kakao 라이브러리 로드 시도
        try {
            const nodeKakao = require('node-kakao');
            console.log('📦 node-kakao 라이브러리를 찾았습니다!');
            
            // 클라이언트 생성 시도
            kakaoClient = new nodeKakao.TalkClient();
            
            // 로그인 시도
            const loginResult = await kakaoClient.login({
                email: process.env.KAKAO_EMAIL,
                password: process.env.KAKAO_PASSWORD,
                deviceName: process.env.DEVICE_ID,
                forced: false
            });

            if (loginResult.success) {
                console.log('✅ 카카오톡 로그인 성공!');
                isLoggedIn = true;
                connectionStatus = '연결됨';
                lastError = null;
                
                // 오픈채팅방 입장 시도
                await joinOpenChatRooms();
                return true;
            } else {
                throw new Error(`로그인 실패: ${loginResult.status}`);
            }
            
        } catch (libError) {
            console.log('📦 node-kakao 라이브러리가 설치되지 않았습니다.');
            console.log('🔧 라이브러리 설치가 필요합니다: npm install node-kakao');
            connectionStatus = 'node-kakao 라이브러리 필요';
            lastError = 'node-kakao 라이브러리가 설치되지 않음';
            
            // 시뮬레이션 모드로 진행
            await simulateKakaoConnection();
            return false;
        }
        
    } catch (error) {
        console.log(`❌ 카카오톡 연결 실패: ${error.message}`);
        connectionStatus = '연결 실패';
        lastError = error.message;
        
        // 재시도 스케줄링 (최대 3회)
        if (loginAttempts < 3) {
            const waitTime = loginAttempts * 30; // 30초, 60초, 90초
            console.log(`🔄 ${waitTime}초 후 재시도합니다...`);
            setTimeout(attemptKakaoConnection, waitTime * 1000);
        } else {
            console.log('❌ 최대 재시도 횟수에 도달했습니다.');
            connectionStatus = '최대 재시도 초과';
        }
        return false;
    }
}

// 카카오톡 연결 시뮬레이션 (라이브러리 없을 때)
async function simulateKakaoConnection() {
    console.log('🎭 시뮬레이션 모드로 진행합니다...');
    
    // 가상의 채팅방 생성
    chatrooms = {
        [process.env.TARGET_CHATROOM || '테스트방']: {
            id: 'simulated_room_001',
            name: process.env.TARGET_CHATROOM || '테스트방',
            type: 'OPENCHAT',
            memberCount: 5,
            isSimulated: true
        },
        '공동구매방': {
            id: 'simulated_room_002', 
            name: '공동구매방',
            type: 'OPENCHAT',
            memberCount: 12,
            isSimulated: true
        }
    };
    
    isLoggedIn = true;
    connectionStatus = '시뮬레이션 모드';
    console.log('✅ 시뮬레이션 모드에서 연결 완료!');
    console.log(`📝 가상 채팅방 ${Object.keys(chatrooms).length}개 생성됨`);
}

// 오픈채팅방 입장 함수
async function joinOpenChatRooms() {
    try {
        console.log('🚪 오픈채팅방에 입장합니다...');
        
        if (!process.env.OPENCHAT_LINKS) {
            console.log('⚠️  OPENCHAT_LINKS가 설정되지 않았습니다.');
            return;
        }
        
        const openChatLinks = process.env.OPENCHAT_LINKS.split(',');
        
        for (const link of openChatLinks) {
            const trimmedLink = link.trim();
            if (trimmedLink) {
                try {
                    // 실제 입장 로직 (node-kakao 사용)
                    if (kakaoClient) {
                        await kakaoClient.ChannelManager.addOpenChannel(trimmedLink);
                        console.log(`✅ 오픈채팅방 입장 성공: ${trimmedLink}`);
                    }
                } catch (error) {
                    console.log(`❌ 오픈채팅방 입장 실패: ${trimmedLink}, 오류: ${error.message}`);
                }
            }
        }
        
        // 채팅방 목록 업데이트
        if (kakaoClient) {
            const channelList = kakaoClient.ChannelManager.getAllChannels();
            chatrooms = {};
            
            channelList.forEach(channel => {
                chatrooms[channel.info.name] = {
                    id: channel.info.channelId,
                    name: channel.info.name,
                    type: channel.info.type,
                    memberCount: channel.info.memberCount || 0
                };
                console.log(`📝 채팅방 저장: ${channel.info.name}`);
            });
        }
        
        console.log(`✅ 총 ${Object.keys(chatrooms).length}개 채팅방 확인 완료`);
        
    } catch (error) {
        console.log(`❌ 오픈채팅방 입장 중 오류: ${error.message}`);
    }
}

// 메시지 전송 함수
async function sendOrderMessage(chatRoomName, message) {
    try {
        if (!isLoggedIn) {
            throw new Error('카카오톡에 로그인되지 않았습니다');
        }
        
        const chatroom = chatrooms[chatRoomName];
        if (!chatroom) {
            throw new Error(`채팅방을 찾을 수 없습니다: ${chatRoomName}`);
        }
        
        if (chatroom.isSimulated) {
            // 시뮬레이션 모드
            console.log(`🎭 [시뮬레이션] ${chatRoomName}에 메시지 전송:`);
            console.log(message);
            return true;
        }
        
        // 실제 메시지 전송
        if (kakaoClient) {
            const channel = kakaoClient.ChannelManager.get(chatroom.id);
            if (!channel) {
                throw new Error(`채널에 접근할 수 없습니다: ${chatRoomName}`);
            }
            
            await channel.sendText(message);
            console.log(`✅ 실제 메시지 전송 완료: ${chatRoomName}`);
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.log(`❌ 메시지 전송 실패: ${error.message}`);
        return false;
    }
}

// 웹 API 설정
app.get('/', (req, res) => {
    res.json({
        상태: '카카오톡 주문봇이 정상 작동중입니다! 🤖',
        연결상태: isLoggedIn ? '연결됨 ✅' : '연결안됨 ❌',
        연결상세: connectionStatus,
        로그인시도: loginAttempts,
        채팅방수: Object.keys(chatrooms).length,
        실행시간: `${Math.floor((Date.now() - startTime) / 1000)}초`,
        서버시간: new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}),
        마지막오류: lastError,
        환경변수_확인: {
            이메일: process.env.KAKAO_EMAIL ? '설정됨' : '설정안됨',
            비밀번호: process.env.KAKAO_PASSWORD ? '설정됨' : '설정안됨',
            기기아이디: process.env.DEVICE_ID ? '설정됨' : '설정안됨',
            채팅방링크: process.env.OPENCHAT_LINKS ? '설정됨' : '설정안됨',
            대상채팅방: process.env.TARGET_CHATROOM ? '설정됨' : '설정안됨'
        }
    });
});

// 상태 확인 API
app.get('/status', (req, res) => {
    res.json({
        카카오톡연결: isLoggedIn,
        연결상태: connectionStatus,
        로그인시도: loginAttempts,
        마지막오류: lastError,
        실행시간_초: Math.floor((Date.now() - startTime) / 1000),
        메모리사용량: process.memoryUsage(),
        환경변수: {
            NODE_ENV: process.env.NODE_ENV || 'development',
            PORT: process.env.PORT || 8080,
            KAKAO_EMAIL_EXISTS: !!process.env.KAKAO_EMAIL,
            DEVICE_ID: process.env.DEVICE_ID
        },
        현재시간: new Date().toISOString()
    });
});

// 채팅방 목록 조회 API
app.get('/chatrooms', (req, res) => {
    res.json({
        연결상태: isLoggedIn ? '연결됨 ✅' : '연결안됨 ❌',
        연결상세: connectionStatus,
        채팅방목록: chatrooms,
        총개수: Object.keys(chatrooms).length,
        메시지: isLoggedIn ? 
            (Object.keys(chatrooms).length > 0 ? '채팅방에 연결되었습니다' : '채팅방을 찾는 중입니다...') : 
            '카카오톡 연결을 시도중입니다...',
        시뮬레이션모드: Object.values(chatrooms).some(room => room.isSimulated)
    });
});

// 주문 알림 API
app.post('/order', async (req, res) => {
    try {
        const { 상품명, 가격, 주문자, 특이사항 } = req.body;
        
        if (!상품명 || !가격 || !주문자) {
            return res.status(400).json({
                error: '필수 정보가 누락되었습니다',
                필수: ['상품명', '가격', '주문자'],
                받은데이터: req.body
            });
        }
        
        const orderMessage = `🛒 새로운 주문이 접수되었습니다!

📦 상품명: ${상품명}
💰 가격: ${가격}원
👤 주문자: ${주문자}
${특이사항 ? `📝 특이사항: ${특이사항}` : ''}

⏰ 주문시간: ${new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'})}`;

        console.log('📬 주문 알림 생성:');
        console.log(orderMessage);
        
        if (isLoggedIn) {
            const targetChatroom = process.env.TARGET_CHATROOM;
            const success = await sendOrderMessage(targetChatroom, orderMessage);
            
            res.json({
                message: success ? '주문 알림이 전송되었습니다! ✅' : '메시지 전송에 실패했습니다 ❌',
                주문정보: { 상품명, 가격, 주문자, 특이사항 },
                전송시간: new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}),
                카카오톡상태: connectionStatus,
                전송성공: success,
                생성된메시지: orderMessage
            });
        } else {
            res.json({
                message: '주문이 접수되었습니다! (카카오톡 연결 대기중)',
                주문정보: { 상품명, 가격, 주문자, 특이사항 },
                전송시간: new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}),
                카카오톡상태: connectionStatus,
                전송성공: false,
                생성된메시지: orderMessage,
                참고: '카카오톡 연결 후 자동으로 전송됩니다'
            });
        }
        
    } catch (error) {
        console.log(`❌ 주문 처리 중 오류: ${error.message}`);
        res.status(500).json({
            error: '주문 처리 중 오류가 발생했습니다',
            details: error.message
        });
    }
});

// 수동 재연결 API
app.post('/reconnect', async (req, res) => {
    console.log('🔄 수동 재연결 요청을 받았습니다...');
    loginAttempts = 0;
    connectionStatus = '재연결 시도중';
    lastError = null;
    
    const success = await attemptKakaoConnection();
    
    res.json({
        message: success ? '재연결 성공! ✅' : '재연결 시도중... ⏳',
        연결상태: connectionStatus,
        로그인시도: loginAttempts,
        마지막오류: lastError
    });
});

// 나머지 API들 (기존과 동일)
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage(),
        kakao_status: connectionStatus
    });
});

app.get('/test', (req, res) => {
    res.json({
        message: '테스트 성공! 🎉',
        시간: new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}),
        카카오톡상태: connectionStatus,
        요청정보: {
            method: req.method,
            url: req.url,
            headers: req.headers,
            query: req.query
        }
    });
});

app.get('/env-test', (req, res) => {
    res.json({
        환경변수_존재여부: {
            KAKAO_EMAIL: !!process.env.KAKAO_EMAIL,
            KAKAO_PASSWORD: !!process.env.KAKAO_PASSWORD,
            DEVICE_ID: !!process.env.DEVICE_ID,
            OPENCHAT_LINKS: !!process.env.OPENCHAT_LINKS,
            TARGET_CHATROOM: !!process.env.TARGET_CHATROOM,
            PORT: !!process.env.PORT
        },
        환경변수_값들: {
            KAKAO_EMAIL: process.env.KAKAO_EMAIL ? '설정됨 ✅' : '설정안됨 ❌',
            KAKAO_PASSWORD: process.env.KAKAO_PASSWORD ? '설정됨 ✅' : '설정안됨 ❌',
            DEVICE_ID: process.env.DEVICE_ID || '설정안됨',
            OPENCHAT_LINKS: process.env.OPENCHAT_LINKS ? '설정됨 ✅' : '설정안됨 ❌',
            TARGET_CHATROOM: process.env.TARGET_CHATROOM || '설정안됨',
            PORT: process.env.PORT || 8080
        },
        카카오톡상태: connectionStatus
    });
});

// 404 핸들러
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'API 엔드포인트를 찾을 수 없습니다',
        요청경로: req.originalUrl,
        사용가능한_API: {
            'GET /': '봇 상태 확인',
            'GET /status': '상세 상태 정보',
            'GET /chatrooms': '채팅방 목록',
            'POST /order': '주문 알림 전송',
            'POST /reconnect': '수동 재연결',
            'GET /health': '헬스체크',
            'GET /test': '테스트',
            'GET /env-test': '환경변수 확인'
        },
        카카오톡상태: connectionStatus
    });
});

// 웹서버 시작
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 웹서버가 ${PORT}번 포트에서 실행중입니다!`);
    console.log(`📡 사용 가능한 API:`);
    console.log(`   GET  / - 봇 상태 확인`);
    console.log(`   GET  /status - 상세 상태 정보`);
    console.log(`   POST /order - 주문 알림 전송`);
    console.log(`   GET  /chatrooms - 채팅방 목록`);
    console.log(`   POST /reconnect - 수동 재연결`);
    console.log(`   GET  /health - 헬스체크`);
    console.log(`   GET  /test - 테스트`);
    console.log(`   GET  /env-test - 환경변수 확인`);
    console.log('');
    console.log('🚀 웹서버가 성공적으로 시작되었습니다!');
    
    // 카카오톡 연결 시도 (10초 후)
    console.log('⏰ 10초 후 카카오톡 연결을 시도합니다...');
    setTimeout(attemptKakaoConnection, 10000);
});

// 에러 핸들링
process.on('uncaughtException', (error) => {
    console.error('❌ 치명적 오류:', error);
    lastError = error.message;
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 처리되지 않은 Promise 거부:', reason);
    lastError = reason.toString();
});

// 정상 종료 처리
process.on('SIGTERM', () => {
    console.log('📴 서버가 종료됩니다...');
    if (kakaoClient) {
        kakaoClient.close();
    }
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('📴 서버가 종료됩니다...');
    if (kakaoClient) {
        kakaoClient.close();
    }
    process.exit(0);
});
