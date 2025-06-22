// Firebase configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Simulated user data (will be replaced with real backend later)
let userData = {
    walletAddress: "0x...",
    balance: 0,
    lastDailyClaim: 0,
    completedTasks: {
        telegram: false,
        twitter: false,
        retweet: false
    },
    referralCode: generateReferralCode(),
    referredUsers: 0
};

// DOM Elements
const connectWalletBtn = document.getElementById('connectWallet');
const walletAddressEl = document.getElementById('walletAddress');
const userBalanceEl = document.getElementById('userBalance');
const dailyBonusBtn = document.getElementById('dailyBonus');
const dailyTimerEl = document.getElementById('dailyTimer');
const telegramVerifyBtn = document.getElementById('telegramVerify');
const twitterVerifyBtn = document.getElementById('twitterVerify');
const retweetVerifyBtn = document.getElementById('retweetVerify');
const referralCodeInput = document.getElementById('referralCode');
const applyReferralBtn = document.getElementById('applyReferral');
const userReferralLinkEl = document.getElementById('userReferralLink');
const copyReferralBtn = document.getElementById('copyReferral');
const referralCountEl = document.getElementById('referralCount');

// Initialize the app
function init() {
    updateUI();
    checkDailyBonusAvailability();
    
    // Set referral link
    userReferralLinkEl.value = `https://dubeweb.com?ref=${userData.referralCode}`;
    referralCountEl.textContent = `You've referred ${userData.referredUsers} friends`;
}

// Connect wallet button handler
connectWalletBtn.addEventListener('click', () => {
    // In a real app, this would connect to MetaMask or other wallet
    // For now, we'll simulate with a random address
    if (!userData.walletAddress) {
        userData.walletAddress = generateWalletAddress();
        walletAddressEl.textContent = userData.walletAddress;
        connectWalletBtn.textContent = 'Disconnect';
        
        // Check if URL has referral parameter
        const urlParams = new URLSearchParams(window.location.search);
        const refCode = urlParams.get('ref');
        if (refCode) {
            applyReferral(refCode);
        }
    } else {
        userData.walletAddress = null;
        walletAddressEl.textContent = '';
        connectWalletBtn.textContent = 'Connect Wallet';
    }
    
    updateUI();
});

// Daily bonus button handler
dailyBonusBtn.addEventListener('click', () => {
    if (canClaimDailyBonus()) {
        userData.balance += 50;
        userData.lastDailyClaim = new Date();
        updateUI();
        checkDailyBonusAvailability();
        alert('You claimed 50 $DUBE daily bonus!');
    }
});

// Task verification buttons
telegramVerifyBtn.addEventListener('click', () => {
    if (!userData.completedTasks.telegram) {
        userData.balance += 70;
        userData.completedTasks.telegram = true;
        updateUI();
        alert('Telegram task verified! 70 $DUBE added to your balance.');
    }
});

twitterVerifyBtn.addEventListener('click', () => {
    if (!userData.completedTasks.twitter) {
        userData.balance += 100;
        userData.completedTasks.twitter = true;
        updateUI();
        alert('Twitter task verified! 100 $DUBE added to your balance.');
    }
});

retweetVerifyBtn.addEventListener('click', () => {
    if (!userData.completedTasks.retweet) {
        userData.balance += 70;
        userData.completedTasks.retweet = true;
        updateUI();
        alert('Retweet task verified! 70 $DUBE added to your balance.');
    }
});

// Referral system
applyReferralBtn.addEventListener('click', () => {
    const code = referralCodeInput.value.trim();
    if (code) {
        applyReferral(code);
    }
});

copyReferralBtn.addEventListener('click', () => {
    userReferralLinkEl.select();
    document.execCommand('copy');
    alert('Referral link copied to clipboard!');
});

// Update UI based on user data
function updateUI() {
    userBalanceEl.textContent = `${userData.balance} DUBE`;
    
    // Update task buttons
    telegramVerifyBtn.disabled = userData.completedTasks.telegram || !userData.walletAddress;
    twitterVerifyBtn.disabled = userData.completedTasks.twitter || !userData.walletAddress;
    retweetVerifyBtn.disabled = userData.completedTasks.retweet || !userData.walletAddress;
    dailyBonusBtn.disabled = !canClaimDailyBonus() || !userData.walletAddress;
    
    if (userData.completedTasks.telegram) {
        telegramVerifyBtn.textContent = 'Completed';
    }
    
    if (userData.completedTasks.twitter) {
        twitterVerifyBtn.textContent = 'Completed';
    }
    
    if (userData.completedTasks.retweet) {
        retweetVerifyBtn.textContent = 'Completed';
    }
}

// Check if daily bonus can be claimed
function canClaimDailyBonus() {
    if (!userData.lastDailyClaim) return true;
    
    const now = new Date();
    const lastClaim = new Date(userData.lastDailyClaim);
    const hoursSinceLastClaim = (now - lastClaim) / (1000 * 60 * 60);
    
    return hoursSinceLastClaim >= 24;
}

// Update daily bonus timer display
function checkDailyBonusAvailability() {
    if (!userData.lastDailyClaim) {
        dailyTimerEl.textContent = 'Available now';
        dailyBonusBtn.disabled = !userData.walletAddress;
        return;
    }
    
    const now = new Date();
    const lastClaim = new Date(userData.lastDailyClaim);
    const nextClaimTime = new Date(lastClaim.getTime() + 24 * 60 * 60 * 1000);
    
    if (now >= nextClaimTime) {
        dailyTimerEl.textContent = 'Available now';
        dailyBonusBtn.disabled = !userData.walletAddress;
    } else {
        const hoursLeft = Math.floor((nextClaimTime - now) / (1000 * 60 * 60));
        const minutesLeft = Math.floor(((nextClaimTime - now) % (1000 * 60 * 60)) / (1000 * 60));
        dailyTimerEl.textContent = `Available in ${hoursLeft}h ${minutesLeft}m`;
        dailyBonusBtn.disabled = true;
    }
}

// Apply referral code
function applyReferral(code) {
    if (userData.walletAddress && code && code !== userData.referralCode) {
        // In a real app, this would check the database for valid code
        userData.balance += 150;
        userData.referredUsers += 1;
        updateUI();
        referralCountEl.textContent = `You've referred ${userData.referredUsers} friends`;
        alert('Referral applied! 150 $DUBE added to your balance.');
    }
}

// Helper function to generate random wallet address
function generateWalletAddress() {
    const chars = '0123456789abcdef';
    let address = '0x';
    for (let i = 0; i < 40; i++) {
        address += chars[Math.floor(Math.random() * chars.length)];
    }
    return address;
}

// Helper function to generate referral code
function generateReferralCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// Initialize the app
init();

// Check daily bonus every minute
setInterval(checkDailyBonusAvailability, 60000);