// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDLxVyd6Wzp8gJ-BMZWCQyJlDJhk0a1UyA",
  authDomain: "dube-f0210.firebaseapp.com",
  projectId: "dube-f0210",
  storageBucket: "dube-f0210.firebasestorage.app",
  messagingSenderId: "369666225818",
  appId: "1:369666225818:web:bc99423f4c8c163f99d123",
  measurementId: "G-RNP41FMVND"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// User data structure
let userData = {
    uid: null,
    twitterUsername: null,
    twitterProfilePic: null,
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
const twitterLoginBtn = document.getElementById('twitterLogin');
const userInfoEl = document.getElementById('userInfo');
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

// Create profile icon container for top right
const profileIconContainer = document.createElement('div');
profileIconContainer.className = 'profile-icon-container';
document.body.appendChild(profileIconContainer);

// Initialize the app
async function init() {
    updateUI();
    checkDailyBonusAvailability();
    
    // Set up auth state listener
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            // User is signed in
            const token = await user.getIdTokenResult();
            userData.uid = user.uid;
            userData.twitterUsername = token.claims.screen_name;
            userData.twitterProfilePic = user.photoURL;
            
            // Display user info in profile icon (top right)
            profileIconContainer.innerHTML = `
                <img src="${userData.twitterProfilePic}" alt="Profile" class="profile-icon">
                <div class="profile-dropdown">
                    <span>@${userData.twitterUsername}</span>
                    <button id="logoutBtn">Logout</button>
                </div>
            `;
            
            // Add logout button event listener
            document.getElementById('logoutBtn').addEventListener('click', async () => {
                await auth.signOut();
            });
            
            // Update login button (center)
            twitterLoginBtn.style.display = 'none';
            
            // Load user data
            await loadUserData();
            
            // Update referral link
            userReferralLinkEl.value = `${window.location.origin}${window.location.pathname}?ref=${userData.referralCode}`;
            referralCountEl.textContent = `You've referred ${userData.referredUsers} friends`;
            
            // Check for referral code in URL
            const urlParams = new URLSearchParams(window.location.search);
            const refCode = urlParams.get('ref');
            if (refCode && refCode !== userData.referralCode) {
                applyReferral(refCode);
            }
        } else {
            // User is signed out
            userData.uid = null;
            userData.twitterUsername = null;
            userData.twitterProfilePic = null;
            
            // Clear profile icon
            profileIconContainer.innerHTML = '';
            
            // Show login button (center)
            twitterLoginBtn.style.display = 'block';
            twitterLoginBtn.innerHTML = '<i class="fab fa-twitter"></i> Login with Twitter';
        }
        updateUI();
    });
}

// Twitter login button handler (centered button)
twitterLoginBtn.addEventListener('click', async () => {
    if (auth.currentUser) {
        // User is logged in, so log them out
        await auth.signOut();
    } else {
        // Sign in with Twitter
        const provider = new firebase.auth.TwitterAuthProvider();
        try {
            await auth.signInWithPopup(provider);
        } catch (error) {
            console.error("Twitter login error:", error);
            alert('Error logging in with Twitter. Please try again.');
        }
    }
});

// Display user info
            userInfoEl.innerHTML = `
                <img src="${userData.twitterProfilePic}" alt="Profile" class="profile-pic">
                <span>@${userData.twitterUsername}</span>
            `;
            twitterLoginBtn.textContent = 'Logout';
            
            // Load user data
            await loadUserData();
            
            // Update referral link
            userReferralLinkEl.value = `${window.location.origin}${window.location.pathname}?ref=${userData.referralCode}`;
            referralCountEl.textContent = `You've referred ${userData.referredUsers} friends`;
            
            // Check for referral code in URL
            const urlParams = new URLSearchParams(window.location.search);
            const refCode = urlParams.get('ref');
            if (refCode && refCode !== userData.referralCode) {
                applyReferral(refCode);
            }
        } else {
            // User is signed out
            userData.uid = null;
            userData.twitterUsername = null;
            userData.twitterProfilePic = null;
            userInfoEl.textContent = '';
            twitterLoginBtn.innerHTML = '<i class="fab fa-twitter"></i> Login with Twitter';
        }
        updateUI();
    });
}

// Twitter login button handler
twitterLoginBtn.addEventListener('click', async () => {
    if (auth.currentUser) {
        // User is logged in, so log them out
        await auth.signOut();
    } else {
        // Sign in with Twitter
        const provider = new firebase.auth.TwitterAuthProvider();
        try {
            await auth.signInWithPopup(provider);
        } catch (error) {
            console.error("Twitter login error:", error);
            alert('Error logging in with Twitter. Please try again.');
        }
    }
});

// Load user data from Firebase
async function loadUserData() {
    if (!userData.uid) return;
    
    try {
        const userDoc = await db.collection('users').doc(userData.uid).get();
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
    if (!userData.uid) return;
    
    try {
        await db.collection('users').doc(userData.uid).set({
            uid: userData.uid,
            twitterUsername: userData.twitterUsername,
            twitterProfilePic: userData.twitterProfilePic,
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
        userData.balance += 100; // Updated to 100 DUBE
        userData.lastDailyClaim = new Date();
        await saveUserData();
        updateUI();
        checkDailyBonusAvailability();
        alert('You claimed 100 $DUBE daily bonus!');
    }
});

// Task verification buttons
telegramVerifyBtn.addEventListener('click', async () => {
    if (!userData.completedTasks.telegram) {
        userData.balance += 150; // Updated to 150 DUBE
        userData.completedTasks.telegram = true;
        await saveUserData();
        updateUI();
        alert('Telegram task verified! 150 $DUBE added to your balance.');
    }
});

twitterVerifyBtn.addEventListener('click', async () => {
    if (!userData.completedTasks.twitter) {
        userData.balance += 200; // Updated to 200 DUBE
        userData.completedTasks.twitter = true;
        await saveUserData();
        updateUI();
        alert('Twitter task verified! 200 $DUBE added to your balance.');
    }
});

retweetVerifyBtn.addEventListener('click', async () => {
    if (!userData.completedTasks.retweet) {
        userData.balance += 150; // Updated to 150 DUBE
        userData.completedTasks.retweet = true;
        await saveUserData();
        updateUI();
        alert('Retweet task verified! 150 $DUBE added to your balance.');
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
    telegramVerifyBtn.disabled = userData.completedTasks.telegram || !userData.uid;
    twitterVerifyBtn.disabled = userData.completedTasks.twitter || !userData.uid;
    retweetVerifyBtn.disabled = userData.completedTasks.retweet || !userData.uid;
    dailyBonusBtn.disabled = !canClaimDailyBonus() || !userData.uid;
    
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
        dailyBonusBtn.disabled = !userData.uid;
        return;
    }
    
    const now = new Date();
    const lastClaim = new Date(userData.lastDailyClaim);
    const nextClaimTime = new Date(lastClaim.getTime() + 24 * 60 * 60 * 1000);
    
    if (now >= nextClaimTime) {
        dailyTimerEl.textContent = 'Available now';
        dailyBonusBtn.disabled = !userData.uid;
    } else {
        const hoursLeft = Math.floor((nextClaimTime - now) / (1000 * 60 * 60));
        const minutesLeft = Math.floor(((nextClaimTime - now) % (1000 * 60 * 60)) / (1000 * 60));
        dailyTimerEl.textContent = `Available in ${hoursLeft}h ${minutesLeft}m`;
        dailyBonusBtn.disabled = true;
    }
}

// Apply referral code
async function applyReferral(code) {
    if (userData.uid && code && code !== userData.referralCode) {
        try {
            // Check if referral code exists in database
            const refQuery = await db.collection('users').where('referralCode', '==', code).limit(1).get();
            
            if (!refQuery.empty) {
                // Valid referral code found
                userData.balance += 300; // Updated to 300 DUBE
                userData.referredUsers += 1;
                
                // Update referrer's count
                const referrerDoc = refQuery.docs[0];
                await db.collection('users').doc(referrerDoc.id).update({
                    referredUsers: firebase.firestore.FieldValue.increment(1)
                });
                
                await saveUserData();
                updateUI();
                referralCountEl.textContent = `You've referred ${userData.referredUsers} friends`;
                alert('Referral applied! 300 $DUBE added to your balance.');
            } else {
                alert('Invalid referral code.');
            }
        } catch (error) {
            console.error("Error applying referral:", error);
            alert('An error occurred while applying the referral.');
        }
    }
} ...

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
