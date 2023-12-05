//! Shared State
//!
//! Store information about the state of the application in a send + sync
//! struct.  All access and mutations to state should be performed here.

use std::{collections::HashMap, sync::Arc};

use anyhow::{anyhow, Result};
use axum::extract::ws::{Message, WebSocket};
use chrono::{DateTime, Utc};
use futures_util::stream::SplitSink;
use serde::Serialize;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::{get_mut_room, get_or_create_room, get_room};

#[derive(Serialize, Debug, Clone)]
pub(crate) struct User {
    #[serde(skip_serializing)]
    pub(crate) session_id: Uuid,
    pub(crate) user_id: String,
    pub(crate) first_name: String,
    pub(crate) last_name: String,
    pub(crate) image: String,
    #[serde(skip_serializing)]
    pub(crate) socket: Option<Arc<Mutex<SplitSink<WebSocket, Message>>>>,
    #[serde(skip_serializing)]
    pub(crate) last_heartbeat: DateTime<Utc>,
}

impl PartialEq for User {
    fn eq(&self, other: &Self) -> bool {
        self.session_id == other.session_id

            // todo: is this needed, or can we assume if session_id is equal, then the object is equal for most purposes
            && self.user_id == other.user_id
            && self.first_name == other.first_name
            && self.last_name == other.last_name
            && self.image == other.image
    }
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub(crate) struct Room {
    pub(crate) file_id: Uuid,
    pub(crate) users: HashMap<Uuid, User>,
}

impl Room {
    pub(crate) fn new(file_id: Uuid) -> Self {
        Room {
            file_id,
            users: HashMap::new(),
        }
    }
}

#[derive(Debug)]
pub(crate) struct State {
    pub(crate) rooms: Mutex<HashMap<Uuid, Room>>,
}

impl State {
    pub(crate) fn new() -> Self {
        State {
            rooms: Mutex::new(HashMap::new()),
        }
    }

    /// Retrieves a copy of a room.
    pub(crate) async fn get_room(&self, file_id: &Uuid) -> Result<Room> {
        let room = get_room!(self, file_id)?.to_owned();

        Ok(room)
    }

    /// Add a user to a room.  If the room doesn't exist, it is created.  Users
    /// are only added to a room once (HashMap).  Returns true if the user was
    /// newly added.
    pub(crate) async fn enter_room(&self, file_id: Uuid, user: &User) -> bool {
        let is_new = get_or_create_room!(self, file_id)
            .users
            .insert(user.session_id.to_owned(), user.to_owned())
            .is_none();

        tracing::trace!("User {:?} entered room {:?}", user.session_id, file_id);

        is_new
    }

    /// Removes a user from a room. If the room is empty, it deletes the room.
    /// Returns true if the room still exists after the user leaves.
    pub(crate) async fn leave_room(&self, file_id: Uuid, session_id: &Uuid) -> Result<bool> {
        get_mut_room!(self, file_id)?.users.remove(session_id);
        let num_in_room = get_room!(self, file_id)?.users.len();

        tracing::trace!(
            "User {:?} is leaving room {}, {} user(s) left",
            session_id,
            file_id,
            num_in_room
        );

        if num_in_room == 0 {
            self.remove_room(file_id).await;
        }

        Ok(num_in_room != 0)
    }

    /// Removes a room.
    pub(crate) async fn remove_room(&self, file_id: Uuid) {
        self.rooms.lock().await.remove(&file_id);

        tracing::trace!("Room {file_id} removed");
    }

    /// Retrieves a copy of a user in a room
    pub(crate) async fn _get_user_in_room(
        &self,
        file_id: &Uuid,
        session_id: &Uuid,
    ) -> Result<User> {
        let user = get_room!(self, file_id)?
            .users
            .get(session_id)
            .ok_or(anyhow!("User {} not found in Room {}", session_id, file_id))?
            .to_owned();

        Ok(user)
    }

    /// Updates a user's hearbeat in a room
    pub(crate) async fn update_heartbeat(&self, file_id: Uuid, session_id: &Uuid) -> Result<()> {
        get_mut_room!(self, file_id)?
            .users
            .entry(session_id.clone())
            .and_modify(|user| {
                user.last_heartbeat = Utc::now();
                tracing::trace!("Updating heartbeat for {session_id}");
            });

        Ok(())
    }
}

#[macro_export]
macro_rules! get_room {
    ( $self:ident, $file_id:ident ) => {
        $self
            .rooms
            .lock()
            .await
            .get(&$file_id)
            .ok_or(anyhow!("Room {} not found", $file_id))
    };
}

#[macro_export]
macro_rules! get_mut_room {
    ( $self:ident, $file_id:ident ) => {
        $self
            .rooms
            .lock()
            .await
            .get_mut(&$file_id)
            .ok_or(anyhow!("Room {} not found", $file_id))
    };
}

#[macro_export]
macro_rules! get_or_create_room {
    ( $self:ident, $file_id:ident ) => {
        $self.rooms.lock().await.entry($file_id).or_insert_with(|| {
            tracing::trace!("Room {} created", $file_id.clone());
            Room::new($file_id)
        })
    };
}

#[cfg(test)]
mod tests {
    use crate::test_util::new_user;

    use super::*;

    #[tokio::test]
    async fn enters_retrieves_leaves_and_removes_a_room() {
        let state = State::new();
        let file_id = Uuid::new_v4();
        let user = new_user();
        let user2 = new_user();

        let is_new = state.enter_room(file_id, &user).await;
        let room = state.get_room(&file_id).await.unwrap();
        let user = room.users.get(&user.session_id).unwrap();

        assert!(is_new);
        assert_eq!(state.rooms.lock().await.len(), 1);
        assert_eq!(room.users.len(), 1);
        assert_eq!(room.users.get(&user.session_id), Some(user));

        // leave the room of 2 users
        state.enter_room(file_id, &user2).await;
        state.leave_room(file_id, &user.session_id).await.unwrap();
        let room = state.get_room(&file_id).await.unwrap();

        assert_eq!(room.users.len(), 1);
        assert_eq!(room.users.get(&user2.session_id), Some(&user2));

        // leave a room of 1 user
        state.leave_room(file_id, &user2.session_id).await.unwrap();
        let room = state.get_room(&file_id).await;
        assert!(room.is_err());
    }

    #[tokio::test]
    async fn updates_a_users_heartbeat() {
        let state = State::new();
        let file_id = Uuid::new_v4();
        let user = new_user();

        state.enter_room(file_id, &user).await;
        let old_heartbeat = state
            ._get_user_in_room(&file_id, &user.session_id)
            .await
            .unwrap()
            .last_heartbeat;

        state
            .update_heartbeat(file_id, &user.session_id)
            .await
            .unwrap();
        let new_heartbeat = state
            ._get_user_in_room(&file_id, &user.session_id)
            .await
            .unwrap()
            .last_heartbeat;

        assert!(old_heartbeat < new_heartbeat);
    }
}
