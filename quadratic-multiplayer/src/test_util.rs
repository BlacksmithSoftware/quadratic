use fake::faker::filesystem::en::FilePath;
use fake::faker::internet::en::FreeEmail;
use fake::faker::name::en::{FirstName, LastName};
use fake::Fake;
use futures::stream::StreamExt;
use futures_util::SinkExt;
use std::sync::Arc;
use std::{
    fmt::Debug,
    future::IntoFuture,
    net::{Ipv4Addr, SocketAddr},
};
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio_tungstenite::{tungstenite, MaybeTlsStream, WebSocketStream};
use uuid::Uuid;

use crate::message::request::MessageRequest;
use crate::state::user::{User, UserState};
use crate::state::State;

pub(crate) fn assert_anyhow_error<T: Debug>(result: anyhow::Result<T>, message: &str) {
    let error = result.unwrap_err();
    let root_cause = error.root_cause();

    assert_eq!(format!("{}", root_cause), message);
}

pub(crate) fn new_user() -> User {
    User {
        session_id: Uuid::new_v4(),
        user_id: Uuid::new_v4().to_string(),
        first_name: FirstName().fake(),
        last_name: LastName().fake(),
        email: FreeEmail().fake(),
        state: UserState {
            sheet_id: Uuid::new_v4(),
            selection: "".to_string(),
            cell_edit: Default::default(),
            x: 0.0,
            y: 0.0,
            visible: false,
            viewport: "initial viewport".to_string(),
        },
        image: FilePath().fake(),
        socket: None,
        last_heartbeat: chrono::Utc::now(),
    }
}

pub(crate) async fn add_user_to_room(
    file_id: Uuid,
    user: User,
    state: Arc<State>,
    connection_id: Uuid,
) -> User {
    state.enter_room(file_id, &user, connection_id).await;
    user
}

pub(crate) async fn add_new_user_to_room(
    file_id: Uuid,
    state: Arc<State>,
    connection_id: Uuid,
) -> User {
    add_user_to_room(file_id, new_user(), state, connection_id).await
}

pub(crate) async fn integration_test_setup(
    state: Arc<State>,
) -> WebSocketStream<MaybeTlsStream<TcpStream>> {
    let listener = tokio::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::UNSPECIFIED, 0)))
        .await
        .unwrap();
    let addr = listener.local_addr().unwrap();

    // run the server in a separate thread
    tokio::spawn(axum::serve(listener, crate::server::app(state)).into_future());

    let (socket, _response) = tokio_tungstenite::connect_async(format!("ws://{addr}/ws"))
        .await
        .unwrap();

    socket
}

pub(crate) async fn integration_test_send_and_receive(
    socket: Arc<Mutex<WebSocketStream<MaybeTlsStream<TcpStream>>>>,
    request: MessageRequest,
    expect_response: bool,
) -> Option<String> {
    // send the message
    socket
        .lock()
        .await
        .send(tungstenite::Message::text(
            serde_json::to_string(&request).unwrap(),
        ))
        .await
        .unwrap();

    if !expect_response {
        return None;
    }

    let response = match socket.lock().await.next().await.unwrap().unwrap() {
        tungstenite::Message::Text(msg) => msg,
        other => panic!("expected a text message but got {other:?}"),
    };

    Some(response)
}
