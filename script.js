const socket = io();

const loginScreen = document.getElementById('login-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');

const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const errorMessage = document.getElementById('error-message');

const playersList = document.getElementById('players-list');
const startBtn = document.getElementById('start-btn');
const waitingHostText = document.getElementById('waiting-host-text');

const myRoleSpan = document.getElementById('my-role');
const myCampSpan = document.getElementById('my-camp');
const gamePlayersList = document.getElementById('game-players-list');

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');

// Rejoindre la partie
joinBtn.addEventListener('click', joinGame);
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinGame();
});

function joinGame() {
    const username = usernameInput.value.trim();
    if (username.length > 0) {
        socket.emit('join_game', username);
    } else {
        errorMessage.textContent = "Veuillez entrer un pseudo valide.";
    }
}

// Gestion des erreurs de connexion/pseudo
socket.on('error_msg', (msg) => {
    errorMessage.textContent = msg;
});

// Mise à jour de l'écran d'attente (Lobby)
socket.on('update_lobby', (lobbyData) => {
    // Si le joueur est sur l'écran de login et que la liste se met à jour, ça veut dire qu'il a réussi à rejoindre
    if (!loginScreen.classList.contains('hidden') && lobbyData.some(p => p.name === usernameInput.value.trim())) {
        loginScreen.classList.add('hidden');
        lobbyScreen.classList.remove('hidden');
    }

    playersList.innerHTML = '';
    let isHost = false;

    lobbyData.forEach((player, index) => {
        const li = document.createElement('li');
        li.textContent = player.name + (index === 0 ? " ⭐ (Hôte)" : "");
        playersList.appendChild(li);

        // Si le premier joueur de la liste c'est nous
        if (index === 0 && player.name === usernameInput.value.trim()) {
            isHost = true;
        }
    });

    // Afficher ou cacher le bouton de lancement selon si on est l'hôte
    if (isHost) {
        startBtn.classList.remove('hidden');
        waitingHostText.classList.add('hidden');
    } else {
        startBtn.classList.add('hidden');
        waitingHostText.classList.remove('hidden');
    }
});

// L'hôte clique sur lancer
startBtn.addEventListener('click', () => {
    socket.emit('start_game');
});

// Début effectif du jeu
socket.on('game_started', (data) => {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    updateGamePlayers(data.players);
});

// Réception du rôle secret
socket.on('assign_my_role', (data) => {
    myRoleSpan.textContent = data.role;
    myCampSpan.textContent = data.camp.toUpperCase();
});

// Mise à jour de la liste des joueurs en jeu (avec option de vote au clic)
socket.on('update_game_state', (players) => {
    updateGamePlayers(players);
});

function updateGamePlayers(players) {
    gamePlayersList.innerHTML = '';
    players.forEach(p => {
        const li = document.createElement('li');
        li.textContent = p.name + (p.isAlive ? "" : " 💀");
        if (!p.isAlive) {
            li.classList.add('dead');
        } else {
            // Permettre de voter en cliquant sur un joueur vivant
            li.addEventListener('click', () => {
                if (confirm(`Voulez-vous voter contre ${p.name} ?`)) {
                    socket.emit('vote_player', p.id);
                }
            });
        }
        gamePlayersList.appendChild(li);
    });
}

// Chat en temps réel
sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const message = chatInput.value.trim();
    if (message) {
        socket.emit('send_message', { message });
        chatInput.value = '';
    }
}

socket.on('receive_message', (data) => {
    const div = document.createElement('div');
    div.innerHTML = `<strong>${data.name} :</strong> ${data.message}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// Fin de partie
socket.on('game_over', (msg) => {
    alert(msg);
    window.location.reload();
});