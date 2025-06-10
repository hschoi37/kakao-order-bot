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

// 웹 API 설정
app.get('/', (req, res) => {
    res.json({
        상태: '카카오톡 주문봇이 정상 작동중입니다! 🤖',
        연결상태: isLoggedIn ? '연결됨 ✅' : '연결안됨 ❌',
        로그인시도: loginAttempts,
        채팅방수: Object.keys(chatrooms).length,
        실행시간: `${Math.floor((Date.now() - startTime) / 1000)}초`,
        서버시간: new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}),
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
        로그인시도: loginAttempts,
        실행시간_초: Math.floor((Date.now() - startTime) / 1000),
        메모리사용량: process.memoryUsage(),
        환경변수: {
            NODE_ENV: process.env.NODE_ENV || 'development',
            PORT: process.env.PORT || 8080
        },
        현재시간: new Date().toISOString()
    });
});

// 채팅방 목록 조회 API
app.get('/chatrooms', (req, res) => {
    res.json({
        연결상태: isLoggedIn ? '연결됨 ✅' : '연결안됨 ❌',
        채팅방목록: chatrooms,
        총개수: Object.keys(chatrooms).length,
        메시지: isLoggedIn ? '카카오톡에 연결되었습니다' : '카카오톡 연결을 시도중입니다...'
    });
});

// 테스트용 주문 알림 API (실제 카카오톡 없이도 테스트 가능)
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

        // 현재는 로그에만 출력 (실제 카카오톡 연결 후 전송)
        console.log('📬 주문 알림 생성:');
        console.log(orderMessage);
        
        res.json({
            message: isLoggedIn ? '주문 알림이 전송되었습니다! ✅' : '주문이 접수되었습니다! (카카오톡 연결 대기중)',
            주문정보: { 상품명, 가격, 주문자, 특이사항 },
            전송시간: new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}),
            카카오톡상태: isLoggedIn ? '연결됨' : '연결안됨',
            생성된메시지: orderMessage
        });
        
    } catch (error) {
        console.log(`❌ 주문 처리 중 오류: ${error.message}`);
        res.status(500).json({
            error: '주문 처리 중 오류가 발생했습니다',
            details: error.message
        });
    }
});

// 헬스체크 API
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage()
    });
});

// 테스트용 API들
app.get('/test', (req, res) => {
    res.json({
        message: '테스트 성공! 🎉',
        시간: new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}),
        요청정보: {
            method: req.method,
            url: req.url,
            headers: req.headers,
            query: req.query
        }
    });
});

// 환경변수 테스트 API
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
        }
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
            'GET /health': '헬스체크',
            'GET /test': '테스트',
            'GET /env-test': '환경변수 확인'
        }
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
    console.log(`   GET  /health - 헬스체크`);
    console.log(`   GET  /test - 테스트`);
    console.log(`   GET  /env-test - 환경변수 확인`);
    console.log('');
    console.log('🚀 웹서버가 성공적으로 시작되었습니다!');
    
    // 시뮬레이션: 카카오톡 로그인 시도 (실제로는 하지 않음)
    setTimeout(() => {
        console.log('📱 카카오톡 연결 기능은 다음 단계에서 추가 예정입니다...');
        console.log('✅ 웹서버는 정상 작동중입니다!');
    }, 3000);
});

// 에러 핸들링
process.on('uncaughtException', (error) => {
    console.error('❌ 치명적 오류:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 처리되지 않은 Promise 거부:', reason);
});

// 정상 종료 처리
process.on('SIGTERM', () => {
    console.log('📴 서버가 종료됩니다...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('📴 서버가 종료됩니다...');
    process.exit(0);
});
