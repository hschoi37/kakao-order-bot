// 🤖 초보자용 카카오톡 주문 봇
// 이 코드를 복사해서 그대로 사용하세요!

const { Client } = require('node-kakao');
const express = require('express');

class 주문봇 {
    constructor() {
        this.카카오클라이언트 = new Client();
        this.웹서버 = express();
        this.채팅방목록 = new Map();
        
        console.log('🚀 카카오톡 주문 봇이 시작됩니다!');
        this.서버설정();
        this.카카오톡연결();
    }

    // 웹서버 설정 (Bubble.io가 여기로 주문 정보를 보냅니다)
    서버설정() {
        const 포트번호 = process.env.PORT || 3000;
        
        this.웹서버.use(express.json());
        
        // 봇이 살아있는지 확인하는 페이지
        this.웹서버.get('/', (req, res) => {
            res.json({ 
                상태: '카카오톡 주문봇이 정상 작동중입니다! 🤖',
                연결상태: this.카카오클라이언트.loggedIn ? '연결됨 ✅' : '연결안됨 ❌',
                실행시간: Math.floor(process.uptime()) + '초'
            });
        });

        // Bubble.io에서 주문 정보를 받는 주소
        this.웹서버.post('/주문완료', async (req, res) => {
            console.log('📦 새 주문이 들어왔습니다!', req.body);
            
            try {
                const 결과 = await this.주문메시지보내기(req.body);
                res.json({ 성공: true, 결과: 결과 });
            } catch (error) {
                console.error('❌ 메시지 전송 실패:', error);
                res.status(500).json({ 성공: false, 오류: error.message });
            }
        });

        this.웹서버.listen(포트번호, '0.0.0.0', () => {
            console.log(`🌐 웹서버가 ${포트번호}번 포트에서 실행중입니다!`);
        });
    }

    // 카카오톡에 로그인하기
    async 카카오톡연결() {
        try {
            console.log('🔐 카카오톡에 로그인을 시도합니다...');
            
            const 로그인결과 = await this.카카오클라이언트.login({
                email: process.env.카카오_이메일,      // Railway에서 설정할 환경변수
                password: process.env.카카오_비밀번호,  // Railway에서 설정할 환경변수
                deviceUUID: process.env.기기_아이디,    // Railway에서 설정할 환경변수
                forced: true
            });

            if (로그인결과.success) {
                console.log('✅ 카카오톡 로그인 성공!');
                this.이벤트설정();
                await this.오픈채팅방입장();
            } else {
                console.error('❌ 카카오톡 로그인 실패:', 로그인결과.status);
            }
        } catch (error) {
            console.error('💥 카카오톡 연결 중 오류 발생:', error);
            // 5초 후 재시도
            setTimeout(() => this.카카오톡연결(), 5000);
        }
    }

    // 카카오톡 이벤트 설정
    이벤트설정() {
        // 채팅방 정보 저장
        this.카카오클라이언트.on('chat', (data, channel) => {
            if (channel.info.type === 'OPEN') {
                this.채팅방목록.set(channel.info.name, channel.info.chatId);
                console.log(`📝 채팅방 저장: ${channel.info.name}`);
            }
        });

        // 연결이 끊어지면 재연결
        this.카카오클라이언트.on('disconnected', () => {
            console.log('🔄 연결이 끊어졌습니다. 10초 후 재연결을 시도합니다...');
            setTimeout(() => this.카카오톡연결(), 10000);
        });

        // 5분마다 봇이 살아있다고 알려주기
        setInterval(() => {
            if (this.카카오클라이언트.loggedIn) {
                console.log('💗 봇이 정상 작동중입니다!');
            }
        }, 300000);
    }

    // 오픈채팅방에 입장하기
    async 오픈채팅방입장() {
        try {
            const 채팅방링크들 = process.env.오픈채팅방_링크들.split(',');
            
            for (const 링크 of 채팅방링크들) {
                console.log(`🚪 오픈채팅방에 입장합니다: ${링크}`);
                await this.카카오클라이언트.openChat.joinFromLink(링크.trim());
                
                // 스팸으로 오해받지 않도록 2초 기다리기
                await this.잠시기다리기(2000);
            }
        } catch (error) {
            console.error('❌ 오픈채팅방 입장 실패:', error);
        }
    }

    // 주문 메시지를 카카오톡에 보내기
    async 주문메시지보내기(주문정보) {
        try {
            // 메시지 내용 만들기
            const 메시지 = this.주문메시지만들기(주문정보);
            
            // 보낼 채팅방 찾기
            const 채팅방이름 = process.env.대상_채팅방;
            const 채팅방아이디 = this.채팅방목록.get(채팅방이름);
            
            if (!채팅방아이디) {
                throw new Error(`채팅방을 찾을 수 없습니다: ${채팅방이름}`);
            }

            // 메시지 전송
            const 채널 = this.카카오클라이언트.channelList.get(채팅방아이디);
            if (채널) {
                await 채널.sendChat(메시지);
                console.log('✅ 주문 메시지 전송 완료!');
                console.log('📄 전송된 메시지:', 메시지);
                return { 성공: true, 메시지: '메시지 전송 완료' };
            }
        } catch (error) {
            console.error('❌ 메시지 전송 중 오류:', error);
            throw error;
        }
    }

    // 주문 정보를 예쁜 메시지로 만들기
    주문메시지만들기(주문정보) {
        // Bubble.io에서 받은 정보 분석
        const 고객번호 = 주문정보.고객번호 || 주문정보.customer_number || '익명';
        const 상품목록 = 주문정보.상품목록 || 주문정보.items || [];
        
        let 메시지 = `${고객번호}님 주문!\n`;
        
        // 상품별로 메시지 만들기
        if (Array.isArray(상품목록)) {
            상품목록.forEach(상품 => {
                const 이모지 = this.상품이모지가져오기(상품.종류);
                메시지 += `${이모지}${상품.이름}${이모지} ${상품.설명}, ${상품.수량}개\n`;
            });
        } else {
            // 상품목록이 배열이 아닌 경우 간단하게 처리
            메시지 += `${주문정보.내용 || '주문 상품'}\n`;
        }
        
        return 메시지.trim();
    }

    // 상품 종류에 따른 이모지 선택
    상품이모지가져오기(상품종류) {
        const 이모지맵 = {
            '프리미엄': '⭐',
            '특가': '★', 
            '일반': '',
            'premium': '⭐',
            'special': '★',
            'normal': ''
        };
        return 이모지맵[상품종류] || '';
    }

    // 지정된 시간만큼 기다리기
    잠시기다리기(밀리초) {
        return new Promise(resolve => setTimeout(resolve, 밀리초));
    }
}

// 봇 시작! 🚀
console.log('🎉 카카오톡 주문 봇을 시작합니다!');
const 봇 = new 주문봇();

// 프로그램 종료 시 정리
process.on('SIGINT', () => {
    console.log('👋 봇을 안전하게 종료합니다...');
    if (봇.카카오클라이언트.loggedIn) {
        봇.카카오클라이언트.close();
    }
    process.exit(0);
});
