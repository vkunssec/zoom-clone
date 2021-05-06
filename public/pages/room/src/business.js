class Business {
    constructor({ room, media, view, socketBuilder, peerBuilder }) {
        this.room = room;
        this.media = media;
        this.view = view;

        this.socketBuilder = socketBuilder;
        this.peerBuilder = peerBuilder;

        this.socket = {};
        this.curretStream = {};
        this.currentPeer = {};

        this.peers = new Map();
        this.userRecordings = new Map();
    }

    static initialize(deps) {
        const instance = new Business(deps);
        return instance._init();
    }

    async _init() {
        this.view.configureRecordButton(this.onRecordPressed.bind(this));
        this.view.configureLeaveButton(this.onLeavePressed.bind(this));
        this.curretStream = await this.media.getCamera();

        this.socket = this.socketBuilder
            .setOnUserConnected(this.onUserConnected())
            .setOnUserDisconnected(this.onUserDisconnected())
            .build();

        this.currentPeer = await this.peerBuilder
            .setOnError(this.onPeerError())
            .setOnConnectionOpened(this.onPeerConnectionOpened())
            .setOnCallReceived(this.onPeerCallReceived())
            .setOnPeerStreamReceived(this.onPeerStreamReceived())
            .setOnCallError(this.onPeerCallError())
            .setOnCallClose(this.onPeerCallClose())
            .build();

        this.addVideoStream(this.currentPeer.id);
    }

    addVideoStream(userId, stream = this.curretStream) {
        const recorderInstance = new Recorder(userId, stream);

        this.userRecordings.set(recorderInstance.filename, recorderInstance);

        if (this.recordingEnabled) {
            recorderInstance.startRecording();
        }

        const isCurrentId = userId === this.currentPeer.id;
        this.view.renderVideo({ userId, muted: false, stream, isCurrentId });
    }

    onUserConnected = function () {
        return userId => {
            console.log('User Connected', userId);
            this.currentPeer.call(userId, this.curretStream);
        }
    }
    onUserDisconnected = function () {
        return userId => {
            console.log('User Disconnected', userId);

            if (this.peers.has(userId)) {
                this.peers.get(userId).call.close();
                this.peers.delete(userId);
            }

            this.view.setParticipants(this.peers.size);
            this.stopRecording(userId);
            this.view.removeVideoElement(userId);
        }
    }

    onPeerError = function () {
        return error => {
            console.log('Peer Error', error);
        }
    }
    onPeerConnectionOpened = function () {
        return (peer) => {
            const id = peer.id;
            console.log('Peer Connection Opened', peer);
            this.socket.emit('join-room', this.room, id);
        }
    }
    onPeerCallReceived = function () {
        return call => {
            console.log('Answering Call', call);
            call.answer(this.curretStream);
        }
    }
    onPeerStreamReceived = function () {
        return (call, stream) => {
            const callerId = call.peer;

            if (this.peers.has(callerId)) return;

            this.addVideoStream(callerId, stream);
            this.peers.set(callerId, { call });

            this.view.setParticipants(this.peers.size);
        }
    }
    onPeerCallError = function () {
        return (call, error) => {
            console.log('An Call Error Ocurred', error);
            this.view.removeVideoElement(call.peer);
        }
    }
    onPeerCallClose = function () {
        return (call) => {
            console.log('Call Closed', call.peer);
        }
    }

    onRecordPressed(recordingEnabled) {
        this.recordingEnabled = recordingEnabled;

        for (const [key, value] of this.userRecordings) {
            if (this.recordingEnabled) {
                value.startRecording();
                continue;
            }
            this.stopRecording(key);
        }
    }

    async stopRecording(userId) {
        const userRecordings = this.userRecordings;
        for (const [key, value] of userRecordings) {
            const isContextUser = key.includes(userId);
            if (!isContextUser) continue;

            const rec = value;
            const isRecordingActive = rec.recordingActive;
            if (!isRecordingActive) continue;

            await rec.stopRecording();
            this.playRecordings(key);
        }
    }

    playRecordings(userId) {
        const user = this.userRecordings.get(userId);
        const videosURLs = user.getAllVideoURLs();
        videosURLs.map(url => {
            this.view.renderVideo({ url, userId });
        });
    }

    onLeavePressed() {
        this.userRecordings.forEach((value, key) => value.download());
    }
}
