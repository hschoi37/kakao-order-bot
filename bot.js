const express = require('express');
const { Client } = require('node-kakao');

const app = express();
app.use(express.json());

console.log('🎉 카카오톡 주문봇을 시작합니다!');
console.log('🔧 카카오톡에 로그인을 시도합니다...');

// 환경변수 확인
const requiredEnvs = ['KAKAO_EMAIL', 'KAKAO_PASSWORD', 'DEVICE_ID', 'OPENCHAT_LINKS', 'TARGET_CHATROOM'];
const missingEnvs = requiredEnvs.filter(env => !process.env[env]);

if (missingEnvs.length > 0) {
    console.log('❌ 환경변수가 설정되지 않았습니다!');
    console.log('🔧 Railway에서 Variables 탭에서 다음을 설정하세요:');
    missingEnvs.forEach(env => console.log(`   - ${env}`));
    
    // 웹서버는 계속 실행
    app.get('/', (req, res) => {
        res.json({
            상태: '환경변수 설정이 필요합니다 ⚠️',
            필요한_환경변수: missingEnvs,
            설정방법: 'Railway → Variables 탭에서 설정'
        });
    });
    
    const PORT = process.env.PORT || 8080;
    app.listen(PORT, () => {
        console.log(`🌐 웹서버가 ${PORT}번 포트에서 실행중입니다!`);
    });
    return;
}

console.log('✅ 환경변수 확인 완료!');
console.log(`📧 이메일: ${process.env.KAKAO_EMAIL}`);
console.log(`🔧 기기ID: ${process.env.DEVICE_ID}`);

// 카카오톡 클라이언트 설정
const client = new Client();
let chatrooms = {};
let isLoggedIn = false;
let loginAttempts = 0;
const MAX_ATTEMPTS = 5;

// 개선된 로그인 함수
async function loginToKakao() {
    if (loginAttempts >= MAX_ATTEMPTS) {
        console.log(`❌ 최대 로그인 시도 횟수(${MAX_ATTEMPTS})에 도달했습니다.`);
        console.log('🔧 수동으로 다른 기기에서 먼저 로그인해주세요.');
        return false;
    }

    try {
        loginAttempts++;
        console.log(`🔐 카카오톡 로그인 시도 중... (${loginAttempts}/${MAX_ATTEMPTS})`);
        
        // 더 안전한 로그인 설정
        const loginResult = await client.login({
            email: process.env.KAKAO_EMAIL,
            password: process.env.KAKAO_PASSWORD,
            deviceName: process.env.DEVICE_ID,
            deviceUUID: process.env.DEVICE_ID,
            forced: false  // 강제 로그인 비활성화
        });

        if (loginResult.success) {
            console.log('✅ 카카오톡 로그인 성공!');
            isLoggedIn = true;
            
            // 오픈채팅방 입장
            await joinOpenChatRooms();
            return true;
        } else {
            throw new Error(loginResult.status);
        }
    } catch (error) {
        console.log(`❌ 카카오톡 로그인 실패 (시도 ${loginAttempts}): ${error.message}`);
        
        if (loginAttempts < MAX_ATTEMPTS) {
            const waitTime = loginAttempts * 30; // 30초, 60초, 90초 등 점진적 증가
            console.log(`🔄 ${waitTime}초 후 재시도합니다...`);
            setTimeout(loginToKakao, waitTime * 1000);
        }
        return false;
    }
}

// 오픈채팅방 입장 함수
async function joinOpenChatRooms() {
    try {
        console.log('🚪 오픈채팅방에 입장합니다...');
        
        const openChatLinks = process.env.OPENCHAT_LINKS.split(',');
        
        for (const link of openChatLinks) {
            const trimmedLink = link.trim();
            if (trimmedLink) {
                try {
                    await client.ChannelManager.addOpenChannel(trimmedLink);
                    console.log(`✅ 오픈채팅방 입장 성공: ${trimmedLink}`);
                } catch (error) {
                    console.log(`❌ 오픈채팅방 입장 실패: ${trimmedLink}, 오류: ${error.message}`);
                }
            }
        }
        
        // 채팅방 목록 저장
        saveChatrooms();
        
    } catch (error) {
        console.log(`❌ 오픈채팅방 입장 중 오류: ${error.message}`);
    }
}

// 채팅방 저장 함수
function saveChatrooms() {
    try {
        const channelList = client.ChannelManager.getAllChannels();
        chatrooms = {};
        
        channelList.forEach(channel => {
            chatrooms[channel.info.name] = {
                id: channel.info.channelId,
                name: channel.info.name,
                type: channel.info.type
            };
            console.log(`📝 채팅방 저장: ${channel.info.name}`);
        });
        
        console.log(`✅ 총 ${Object.keys(chatrooms).length}개 채팅방 저장 완료`);
        
    } catch (error) {
        console.log(`❌ 채팅방 저장 중 오류: ${error.message}`);
    }
}

// 메시지 전송 함수 (주문 알림용)
async function sendOrderMessage(chatRoomName, message) {
    try {
        if (!isLoggedIn) {
            throw new Error('카카오톡에 로그인되지 않았습니다');
        }
        
        const chatroom = chatrooms[chatRoomName];
        if (!chatroom) {
            throw new Error(`채팅방을 찾을 수 없습니다: ${chatRoomName}`);
        }
        
        const channel = client.ChannelManager.get(chatroom.id);
        if (!channel) {
            throw new Error(`채널에 접근할 수 없습니다: ${chatRoomName}`);
        }
        
        await channel.sendText(message);
        console.log(`✅ 메시지 전송 완료: ${chatRoomName}`);
        return true;
        
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
        로그인시도: `${loginAttempts}/${MAX_ATTEMPTS}`,
        채팅방수: Object.keys(chatrooms).length,
        실행시간: `${Math.floor(process.uptime())}초`,
        환경변수_확인: {
            이메일: process.env.KAKAO_EMAIL ? '설정됨' : '설정안됨',
            비밀번호: process.env.KAKAO_PASSWORD ? '설정됨' : '설정안됨',
            기기아이디: process.env.DEVICE_ID ? '설정됨' : '설정안됨',
            채팅방링크: process.env.OPENCHAT_LINKS ? '설정됨' : '설정안됨',
            대상채팅방: process.env.TARGET_CHATROOM ? '설정됨' : '설정안됨'
        }
    });
});

// 주문 알림 API
app.post('/order', async (req, res) => {
    try {
        const { 상품명, 가격, 주문자, 특이사항 } = req.body;
        
        if (!상품명 || !가격 || !주문자) {
            return res.status(400).json({
                error: '필수 정보가 누락되었습니다',
                필수: ['상품명', '가격', '주문자']
            });
        }
        
        const orderMessage = `🛒 새로운 주문이 접수되었습니다!

📦 상품명: ${상품명}
💰 가격: ${가격}원
👤 주문자: ${주문자}
${특이사항 ? `📝 특이사항: ${특이사항}` : ''}

⏰ 주문시간: ${new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'})}`;

        const targetChatroom = process.env.TARGET_CHATROOM;
        const success = await sendOrderMessage(targetChatroom, orderMessage);
        
        if (success) {
            res.json({
                message: '주문 알림이 전송되었습니다! ✅',
                주문정보: { 상품명, 가격, 주문자, 특이사항 },
                전송시간: new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'})
            });
        } else {
            res.status(500).json({
                error: '메시지 전송에 실패했습니다',
                상태: '카카오톡 연결을 확인해주세요'
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

// 채팅방 목록 조회 API
app.get('/chatrooms', (req, res) => {
    res.json({
        연결상태: isLoggedIn ? '연결됨 ✅' : '연결안됨 ❌',
        채팅방목록: chatrooms,
        총개수: Object.keys(chatrooms).length
    });
});

// 연결 상태 확인 API
app.get('/status', (req, res) => {
    res.json({
        카카오톡연결: isLoggedIn,
        로그인시도: loginAttempts,
        최대시도: MAX_ATTEMPTS,
        실행시간: process.uptime(),
        메모리사용량: process.memoryUsage()
    });
});

// 수동 재연결 API
app.post('/reconnect', async (req, res) => {
    console.log('🔄 수동 재연결 요청을 받았습니다...');
    loginAttempts = 0; // 시도 횟수 초기화
    const success = await loginToKakao();
    
    res.json({
        message: success ? '재연결 성공! ✅' : '재연결 실패 ❌',
        연결상태: isLoggedIn
    });
});

// 웹서버 시작
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🌐 웹서버가 ${PORT}번 포트에서 실행중입니다!`);
    console.log(`📡 API 사용법:`);
    console.log(`   GET  / - 봇 상태 확인`);
    console.log(`   POST /order - 주문 알림 전송`);
    console.log(`   GET  /chatrooms - 채팅방 목록`);
    console.log(`   POST /reconnect - 수동 재연결`);
});

// 카카오톡 로그인 시작 (10초 후)
console.log('⏰ 10초 후 카카오톡 로그인을 시도합니다...');
setTimeout(loginToKakao, 10000);
