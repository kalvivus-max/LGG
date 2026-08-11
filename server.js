const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let players = [];
let gameStarted = false;

io.on('connection', (socket) => {
    console.log(`Connexion : ${socket.id}`);

    // Rejoindre le salon
    socket.on('join_game', (username) => {
        if (gameStarted) {
            socket.emit('error_msg', "La partie a déjà commencé !");
            return;
        }

        // Vérifier si le pseudo est pris
        if (players.some(p => p.name === username)) {
            socket.emit('error_msg', "Ce pseudo est déjà pris !");
            return;
        }

        players.push({
            id: socket.id,
            name: username,
            role: 'En attente',
            camp: 'neutre',
            isAlive: true,
            votes: 0
        });

        updateLobby();
    });

    // Lancer la partie (Seul le premier joueur le peut)
    socket.on('start_game', () => {
        if (players.length < 3) {
            socket.emit('error_msg', "Il faut au moins 3 joueurs pour lancer.");
            return;
        }

        gameStarted = true;
        assignRoles();
        
        // Informer tout le monde que le jeu commence
        io.emit('game_started', {
            players: players.map(p => ({ id: p.id, name: p.name, isAlive: p.isAlive }))
        });

        // Envoyer son rôle secret à chaque joueur
        players.forEach(player => {
            io.to(player.id).emit('assign_my_role', {
                role: player.role,
                camp: player.camp
            });
        });
    });

    // Gestion du Chat
    socket.on('send_message', (data) => {
        const player = players.find(p => p.id === socket.id);
        if (player && player.isAlive) {
            io.emit('receive_message', { name: player.name, message: data.message });
        }
    });

    // Système de vote
    socket.on('vote_player', (targetId) => {
        const voter = players.find(p => p.id === socket.id);
        if (!voter || !voter.isAlive) return;

        // Réinitialiser les votes précédents de ce joueur si besoin, ou stocker la cible
        voter.votedFor = targetId;
        
        io.emit('receive_message', { name: '📢 SYSTÈME', message: `${voter.name} a voté.` });
        
        // Vérifier si tout le monde a voté
        const alivePlayers = players.filter(p => p.isAlive);
        const votesCount = alivePlayers.filter(p => p.votedFor !== undefined).length;

        if (votesCount === alivePlayers.length) {
            resolveVotes();
        }
    });

    // Déconnexion
    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        if (players.length === 0) {
            gameStarted = false;
        }
        updateLobby();
    });
});

function updateLobby() {
    const lobbyData = players.map((p, index) => ({
        name: p.name,
        isHost: index === 0
    }));
    io.emit('update_lobby', lobbyData);
}

function assignRoles() {
    let shuffled = [...players].sort(() => 0.5 - Math.random());
    
    shuffled.forEach((player, index) => {
        player.votedFor = undefined;
        if (index === 0) {
            player.role = 'Loup-Garou 🐺';
            player.camp = 'méchant';
        } else if (index === 1 && shuffled.length >= 5) {
            player.role = 'Sorcier 🧙‍♂️';
            player.camp = 'gentil';
        } else {
            player.role = 'Villageois 🧑‍🌾';
            player.camp = 'gentil';
        }
    });
}

function resolveVotes() {
    // Compter les votes
    let voteCounts = {};
    players.forEach(p => {
        if (p.votedFor) {
            voteCounts[p.votedFor] = (voteCounts[p.votedFor] || 0) + 1;
        }
    });

    let maxVotes = 0;
    let eliminatedId = null;

    for (let targetId in voteCounts) {
        if (voteCounts[targetId] > maxVotes) {
            maxVotes = voteCounts[targetId];
            eliminatedId = targetId;
        }
    }

    if (eliminatedId) {
        let eliminatedPlayer = players.find(p => p.id === eliminatedId);
        if (eliminatedPlayer) {
            eliminatedPlayer.isAlive = false;
            io.emit('receive_message', { name: '⚖️ TRIBUNAL', message: `${eliminatedPlayer.name} a été éliminé par le village ! C'était un ${eliminatedPlayer.role}.` });
        }
    }

    // Reset des votes pour le tour suivant
    players.forEach(p => p.votedFor = undefined);

    // Vérifier les conditions de victoire
    checkWinCondition();
}

function checkWinCondition() {
    const aliveWolves = players.filter(p => p.isAlive && p.camp === 'méchant');
    const aliveVillagers = players.filter(p => p.isAlive && p.camp === 'gentil');

    if (aliveWolves.length === 0) {
        io.emit('game_over', "Victoire des Gentils ! 🥳 Les méchants ont tous été éliminés.");
        resetGame();
    } else if (aliveWolves.length >= aliveVillagers.length) {
        io.emit('game_over', "Victoire des Méchants ! 🐺 La zizanie a gagné le village.");
        resetGame();
    } else {
        io.emit('update_game_state', players.map(p => ({ id: p.id, name: p.name, isAlive: p.isAlive })));
    }
}

function resetGame() {
    gameStarted = false;
    players.forEach(p => {
        p.isAlive = true;
        p.role = 'En attente';
        p.camp = 'neutre';
        p.votedFor = undefined;
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur prêt sur http://localhost:${PORT}`);
});
