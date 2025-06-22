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

// User data structure
let userData = {
    walletAddress: null,
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

// Check if Ethereum provider (like MetaMask) is available
const isMetaMaskInstalled = () => {
    return typeof window.ethereum !== 'undefined' && window.ethereum.isMetaMask;
};

// Initialize the app
async function init() {
    updateUI();
    checkDailyBonusAvailability();
    
    // Set referral link
    userReferralLinkEl.value = `${window.location.origin}${window.location.pathname}?ref=${userData.referralCode}`;
    referralCountEl.textContent = `You've referred ${userData.referredUsers} friends`;
    
    // Check if wallet is already connected
    if (isMetaMaskInstalled()) {
        try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                await handleWalletConnection(accounts[0]);
            }
        } catch (error) {
            console.error("Error checking connected accounts:", error);
        }
    }
    
    // Check for referral code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    if (refCode && userData.walletAddress) {
        applyReferral(refCode);
    }
}

// Connect wallet button handler
connectWalletBtn.addEventListener('click', async () => {
    if (!isMetaMaskInstalled()) {
        alert('Please install MetaMask or another Ethereum wallet to connect!');
        window.open('https://metamask.io/download.html', '_blank');
        return;
    }
    
    if (userData.walletAddress) {
        // Disconnect wallet
        userData.walletAddress = null;
        walletAddressEl.textContent = '';
        connectWalletBtn.textContent = 'Connect Wallet';
    } else {
        try {
            // Request account access
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            await handleWalletConnection(accounts[0]);
        } catch (error) {
            console.error("Error connecting wallet:", error);
            if (error.code === 4001) {
                alert('Please connect your wallet to continue.');
            } else {
                alert('An error occurred while connecting your wallet.');
            }
        }
    }
    
    updateUI();
});

// Handle wallet connection
async function handleWalletConnection(address) {
    userData.walletAddress = address;
    walletAddressEl.textContent = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    connectWalletBtn.textContent = 'Disconnect';
    
    // Check if we need to load user data from Firebase
    await loadUserData();
    
    // Check for referral code in URL now that we're connected
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    if (refCode && refCode !== userData.referralCode) {
        applyReferral(refCode);
    }
    
    updateUI();
}

// Listen for account changes
if (isMetaMaskInstalled()) {
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            // Wallet disconnected
            userData.walletAddress = null;
            walletAddressEl.textContent = '';
            connectWalletBtn.textContent = 'Connect Wallet';
        } else {
            // Account changed
            handleWalletConnection(accounts[0]);
        }
        updateUI();
    });
    
    // Listen for chain changes
    window.ethereum.on('chainChanged', () => {
        window.location.reload();
    });
}

// Load user data from Firebase
async function loadUserData() {
    if (!userData.walletAddress) return;
    
    try {
        const userDoc = await db.collection('users').doc(userData.walletAddress).get();
        if (userDoc.exists) {
            const data = userDoc.data();
            userData.balance = data.balance || 0;
            userData.lastDailyClaim = data.lastDailyClaim ? data.lastDailyClaim.toDate() : 0;
            userData.completedTasks = data.completedTasks || {
                telegram: false,
                twitter: false,
                retweet: false
            };
            userData.referralCode = data.referralCode || generateReferralCode();
            userData.referredUsers = data.referredUsers || 0;
            
            // Update referral link with loaded code
            userReferralLinkEl.value = `${window.location.origin}${window.location.pathname}?ref=${userData.referralCode}`;
            referralCountEl.textContent = `You've referred ${userData.referredUsers} friends`;
        } else {
            // New user - save initial data
            await saveUserData();
        }
    } catch (error) {
        console.error("Error loading user data:", error);
    }
}

// Save user data to Firebase
async function saveUserData() {
    if (!userData.walletAddress) return;
    
    try {
        await db.collection('users').doc(userData.walletAddress).set({
            walletAddress: userData.walletAddress,
            balance: userData.balance,
            lastDailyClaim: userData.lastDailyClaim ? firebase.firestore.Timestamp.fromDate(new Date(userData.lastDailyClaim)) : null,
            completedTasks: userData.completedTasks,
            referralCode: userData.referralCode,
            referredUsers: userData.referredUsers,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error("Error saving user data:", error);
    }
}

// Daily bonus button handler
dailyBonusBtn.addEventListener('click', async () => {
    if (canClaimDailyBonus()) {
        userData.balance += 50;
        userData.lastDailyClaim = new Date();
        await saveUserData();
        updateUI();
        checkDailyBonusAvailability();
        alert('You claimed 50 $DUBE daily bonus!');
    }
});

// Task verification buttons
telegramVerifyBtn.addEventListener('click', async () => {
    if (!userData.completedTasks.telegram) {
        userData.balance += 70;
        userData.completedTasks.telegram = true;
        await saveUserData();
        updateUI();
        alert('Telegram task verified! 70 $DUBE added to your balance.');
    }
});

twitterVerifyBtn.addEventListener('click', async () => {
    if (!userData.completedTasks.twitter) {
        userData.balance += 100;
        userData.completedTasks.twitter = true;
        await saveUserData();
        updateUI();
        alert('Twitter task verified! 100 $DUBE added to your balance.');
    }
});

retweetVerifyBtn.addEventListener('click', async () => {
    if (!userData.completedTasks.retweet) {
        userData.balance += 70;
        userData.completedTasks.retweet = true;
        await saveUserData();
        updateUI();
        alert('Retweet task verified! 70 $DUBE added to your balance.');
    }
});

// Referral system
applyReferralBtn.addEventListener('click', async () => {
    const code = referralCodeInput.value.trim();
    if (code) {
        await applyReferral(code);
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
    } else {
        telegramVerifyBtn.textContent = 'Verify Telegram';
    }
    
    if (userData.completedTasks.twitter) {
        twitterVerifyBtn.textContent = 'Completed';
    } else {
        twitterVerifyBtn.textContent = 'Verify Twitter';
    }
    
    if (userData.completedTasks.retweet) {
        retweetVerifyBtn.textContent = 'Completed';
    } else {
        retweetVerifyBtn.textContent = 'Verify Retweet';
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
async function applyReferral(code) {
    if (userData.walletAddress && code && code !== userData.referralCode) {
        try {
            // Check if referral code exists in database
            const refQuery = await db.collection('users').where('referralCode', '==', code).limit(1).get();
            
            if (!refQuery.empty) {
                // Valid referral code found
                userData.balance += 150;
                userData.referredUsers += 1;
                
                // Update referrer's count
                const referrerDoc = refQuery.docs[0];
                await db.collection('users').doc(referrerDoc.id).update({
                    referredUsers: firebase.firestore.FieldValue.increment(1)
                });
                
                await saveUserData();
                updateUI();
                referralCountEl.textContent = `You've referred ${userData.referredUsers} friends`;
                alert('Referral applied! 150 $DUBE added to your balance.');
            } else {
                alert('Invalid referral code.');
            }
        } catch (error) {
            console.error("Error applying referral:", error);
            alert('An error occurred while applying the referral.');
        }
    }
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
