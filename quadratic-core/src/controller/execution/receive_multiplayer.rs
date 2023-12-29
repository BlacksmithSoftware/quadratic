use super::TransactionType;
use crate::controller::{
    operations::operation::Operation, transaction_summary::TransactionSummary, GridController,
    Transaction,
};
use chrono::{Duration, Utc};
use uuid::Uuid;

// seconds to wait before requesting wait_for_transactions
const SECONDS_TO_WAIT_FOR_GET_TRANSACTIONS: i64 = 5;

impl GridController {
    pub fn received_transaction(
        &mut self,
        transaction_id: Uuid,
        sequence_num: u64,
        operations: Vec<Operation>,
    ) -> TransactionSummary {
        self.transaction_type = TransactionType::MultiplayerKeepSummary;
        self.clear_summary();
        self.client_apply_transaction(transaction_id, sequence_num, operations);
        self.transaction_updated_bounds();
        self.finalize_transaction();
        let mut summary = self.prepare_transaction_summary();
        summary.operations = None;
        summary.save = false;
        summary
    }

    /// Rolls back unsaved transactions to apply earlier transactions received from the server.
    fn rollback_unsaved_transactions(&mut self) {
        self.clear_summary();
        let operations = self
            .unsaved_transactions
            .iter()
            .rev()
            .map(|(_, undo)| undo.operations.clone())
            .collect::<Vec<_>>();
        operations.iter().for_each(|o| {
            self.start_transaction(o.to_vec(), None, TransactionType::MultiplayerKeepSummary)
        });
    }

    /// Reapplies the rolled-back unsaved transactions after adding earlier transactions.
    fn reapply_unsaved_transactions(&mut self) {
        let operations = self
            .unsaved_transactions
            .iter()
            .rev()
            .map(|(forward, _)| forward.operations.clone())
            .collect::<Vec<_>>();
        operations.iter().for_each(|o| {
            self.start_transaction(o.to_vec(), None, TransactionType::MultiplayerKeepSummary)
        });
    }

    /// Used by the server to apply transactions. Since the server owns the sequence_num,
    /// there's no need to check or alter the execution order.
    pub fn server_apply_transaction(&mut self, operations: Vec<Operation>) {
        self.start_transaction(operations, None, TransactionType::Multiplayer);
    }

    /// Server sends us the latest sequence_num to ensure we're in sync. We respond with a request if
    /// we've been missing numbers for too long.
    ///
    /// Returns a [`TransactionSummary`] that will be rendered by the client.
    pub fn receive_sequence_num(&mut self, sequence_num: u64) -> TransactionSummary {
        let mut summary = TransactionSummary::default();
        if sequence_num != self.last_sequence_num {
            let now = Utc::now();
            if match self.last_need_request_transactions_time {
                None => true,
                Some(last_request_transaction_time) => {
                    last_request_transaction_time
                        .checked_add_signed(Duration::seconds(SECONDS_TO_WAIT_FOR_GET_TRANSACTIONS))
                        .unwrap()
                        < now
                }
            } {
                self.last_need_request_transactions_time = None;
                summary.request_transactions = Some(self.last_sequence_num + 1);
            }
        }
        summary
    }

    /// Check the out_of_order_transactions to see if they are next in order. If so, we remove them from
    ///out_of_order_transactions and apply their operations.
    fn apply_out_of_order_transactions(&mut self, sequence_num: u64) {
        let mut sequence_num = sequence_num;

        // nothing to do here
        if self.out_of_order_transactions.is_empty() {
            self.last_sequence_num = sequence_num;
            return;
        }

        // combines all out of order transactions into a single vec of operations
        let mut operations = vec![];

        self.out_of_order_transactions.retain(|t| {
            // while the out of order transaction is next in sequence, we apply it and remove it from the list
            if t.sequence_num.unwrap() == sequence_num + 1 {
                operations.extend(t.operations.clone());
                sequence_num += 1;
                false
            } else {
                true
            }
        });
        self.start_transaction(operations, None, TransactionType::MultiplayerKeepSummary);
        self.last_sequence_num = sequence_num;
    }

    /// Used by the client to ensure transactions are applied in order
    ///
    /// Returns a [`TransactionSummary`] that will be rendered by the client.
    pub fn client_apply_transaction(
        &mut self,
        transaction_id: Uuid,
        sequence_num: u64,
        operations: Vec<Operation>,
    ) {
        // this is the normal case where we receive the next transaction in sequence
        if sequence_num == self.last_sequence_num + 1 {
            // first check if the received transaction is one of ours
            if let Some((index, _)) = self
                .unsaved_transactions
                .iter_mut()
                .enumerate()
                .find(|(_, unsaved_transaction)| unsaved_transaction.0.id == transaction_id)
            {
                // If transaction is the top of the unsaved_transactions, then we only need to set the sequence_num.
                // Note: if the server ever changes the operations in transactions, then we could not take this shortcut.
                if index as u64 == 0 {
                    self.unsaved_transactions.remove(index);

                    // if there are any out of order transactions, now may be the time to apply them. Let's do a quick
                    // check before rolling back unsaved_transactions.
                    if self.out_of_order_transactions.len() > 0
                        && self.out_of_order_transactions[0].sequence_num.unwrap()
                            == sequence_num + 1
                    {
                        self.rollback_unsaved_transactions();
                        self.apply_out_of_order_transactions(sequence_num);
                        self.reapply_unsaved_transactions();
                    } else {
                        // otherwise we just need to set the sequence_num (which is normally taken care of in apply_out_of_order_transactions)
                        self.last_sequence_num = sequence_num;
                    }
                } else {
                    // Otherwise we need to rollback the unsaved transactions and then reapply our found unsaved transaction first.
                    // This handles the case where the server received our transactions out of order. We will need to reapply our unsaved
                    // transactions in the server's order.
                    self.rollback_unsaved_transactions();
                    self.unsaved_transactions.remove(index);
                    self.start_transaction(
                        operations,
                        None,
                        TransactionType::MultiplayerKeepSummary,
                    );
                    self.apply_out_of_order_transactions(sequence_num);
                    self.reapply_unsaved_transactions();
                }
            } else {
                // If the transaction is not one of ours, then we just apply the transaction after rolling back any unsaved transactions (if necessary).
                if !self.unsaved_transactions.is_empty() {
                    self.rollback_unsaved_transactions();
                    self.start_transaction(
                        operations,
                        None,
                        TransactionType::MultiplayerKeepSummary,
                    );
                    self.apply_out_of_order_transactions(sequence_num);
                    self.reapply_unsaved_transactions();
                } else {
                    // otherwise we can just apply the transaction
                    self.start_transaction(operations, None, TransactionType::Multiplayer);
                    self.apply_out_of_order_transactions(sequence_num);

                    // We do not need to render a thumbnail since none of these are our transactions.
                    self.summary.generate_thumbnail = false;
                }
            }
        } else if sequence_num > self.last_sequence_num {
            // If we receive an unexpected later transaction then we just hold on to it in a sorted list.
            // We could apply these transactions as they come in, but only if multiplayer also sent all undo
            // operations w/each Transaction. I don't think this would be worth the cost.
            // We ignore any transactions that we already applied (ie, sequence_num <= self.last_sequence_num).
            let index = self
                .out_of_order_transactions
                .iter()
                .position(|t| t.sequence_num.unwrap() < sequence_num)
                .unwrap_or(self.out_of_order_transactions.len());
            self.out_of_order_transactions.insert(
                index,
                Transaction {
                    id: transaction_id,
                    sequence_num: Some(sequence_num),
                    operations,
                    cursor: None,
                },
            );
        }
    }

    /// Received transactions from the server
    pub fn received_transactions(&mut self, transactions: &Vec<Transaction>) -> TransactionSummary {
        self.clear_summary();
        self.transaction_type = TransactionType::MultiplayerKeepSummary;
        transactions.iter().for_each(|t| {
            self.client_apply_transaction(t.id, t.sequence_num.unwrap(), t.operations.clone())
        });
        self.transaction_updated_bounds();
        self.finalize_transaction();
        let mut summary = self.prepare_transaction_summary();
        summary.operations = None;
        summary.save = false;
        summary
    }
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;

    use uuid::Uuid;

    use crate::{
        controller::{operations::operation::Operation, transaction::Transaction, GridController},
        CellValue, Pos, SheetPos,
    };

    #[test]
    fn test_multiplayer_hello_world() {
        let mut gc1 = GridController::new();
        let sheet_id = gc1.sheet_ids()[0];
        let summary = gc1.set_cell_value(
            SheetPos {
                x: 0,
                y: 0,
                sheet_id,
            },
            "Hello World".to_string(),
            None,
        );
        let sheet = gc1.grid().try_sheet_from_id(sheet_id).unwrap();
        assert_eq!(
            sheet.get_cell_value(Pos { x: 0, y: 0 }),
            Some(CellValue::Text("Hello World".to_string()))
        );

        let transaction_id = Uuid::from_str(&summary.transaction_id.unwrap()).unwrap();
        let operations: Vec<Operation> =
            serde_json::from_str(&summary.operations.unwrap()).unwrap();

        // received our own transaction back
        gc1.received_transaction(transaction_id, 1, operations.clone());

        let sheet = gc1.grid().try_sheet_from_id(sheet_id).unwrap();
        assert_eq!(
            sheet.get_cell_value(Pos { x: 0, y: 0 }),
            Some(CellValue::Text("Hello World".to_string()))
        );
        assert_eq!(gc1.unsaved_transactions.len(), 0);

        let mut gc2 = GridController::new();
        gc2.grid_mut().sheets_mut()[0].id = sheet_id;
        gc2.received_transaction(transaction_id, 1, operations);
        let sheet = gc2.grid().try_sheet_from_id(sheet_id).unwrap();
        assert_eq!(
            sheet.get_cell_value(Pos { x: 0, y: 0 }),
            Some(CellValue::Text("Hello World".to_string()))
        );
    }

    #[test]
    fn test_apply_multiplayer_before_unsaved_transaction() {
        let mut gc1 = GridController::new();
        let sheet_id = gc1.sheet_ids()[0];
        gc1.set_cell_value(
            SheetPos {
                x: 0,
                y: 0,
                sheet_id,
            },
            "Hello World from 1".to_string(),
            None,
        );
        let sheet = gc1.grid().try_sheet_from_id(sheet_id).unwrap();
        assert_eq!(
            sheet.get_cell_value(Pos { x: 0, y: 0 }),
            Some(CellValue::Text("Hello World from 1".to_string()))
        );

        let mut gc2 = GridController::new();
        // set gc2's sheet 1's id to gc1 sheet 1's id
        gc2.grid
            .try_sheet_mut_from_id(gc2.sheet_ids()[0])
            .unwrap()
            .id = sheet_id;
        let summary = gc2.set_cell_value(
            SheetPos {
                x: 0,
                y: 0,
                sheet_id,
            },
            "Hello World from 2".to_string(),
            None,
        );
        let sheet = gc2.grid().try_sheet_from_id(sheet_id).unwrap();
        assert_eq!(
            sheet.get_cell_value(Pos { x: 0, y: 0 }),
            Some(CellValue::Text("Hello World from 2".to_string()))
        );

        let transaction_id = Uuid::from_str(&summary.transaction_id.unwrap()).unwrap();
        let operations = serde_json::from_str(&summary.operations.unwrap()).unwrap();

        // gc1 should apply gc2's cell value to 0,0 before its unsaved transaction
        // and then reapply its unsaved transaction, overwriting 0,0
        gc1.received_transaction(transaction_id, 1, operations);
        let sheet = gc1.grid.try_sheet_from_id(sheet_id).unwrap();
        assert_eq!(
            sheet.get_cell_value(Pos { x: 0, y: 0 }),
            Some(CellValue::Text("Hello World from 1".to_string()))
        );
    }

    #[test]
    fn test_server_apply_transaction() {
        let mut client = GridController::new();
        let sheet_id = client.sheet_ids()[0];
        let summary = client.set_cell_value(
            SheetPos {
                x: 0,
                y: 0,
                sheet_id,
            },
            "Hello World".to_string(),
            None,
        );
        let sheet = client.grid().try_sheet_from_id(sheet_id).unwrap();
        assert_eq!(
            sheet.get_cell_value(Pos { x: 0, y: 0 }),
            Some(CellValue::Text("Hello World".to_string()))
        );
        let operations: Vec<Operation> =
            serde_json::from_str(&summary.operations.unwrap()).unwrap();

        let mut server = GridController::new();
        server
            .grid
            .try_sheet_mut_from_id(server.sheet_ids()[0])
            .unwrap()
            .id = sheet_id;
        server.server_apply_transaction(operations);
        let sheet = server.grid.try_sheet_from_id(sheet_id).unwrap();
        assert_eq!(
            sheet.get_cell_value(Pos { x: 0, y: 0 }),
            Some(CellValue::Text("Hello World".to_string()))
        );
    }

    #[test]
    fn test_handle_receipt_of_earlier_transactions() {
        // client is where the multiplayer transactions are applied from other
        let mut client = GridController::new();
        let sheet_id = client.sheet_ids()[0];
        client.set_cell_value(
            SheetPos {
                x: 0,
                y: 0,
                sheet_id,
            },
            "Client unsaved value".to_string(),
            None,
        );

        // other is where the transaction are created
        let mut other = GridController::new();
        other.grid_mut().sheets_mut()[0].id = sheet_id;
        let other_summary = other.set_cell_value(
            SheetPos {
                x: 0,
                y: 0,
                sheet_id,
            },
            "Other value".to_string(),
            None,
        );
        let other_operations: Vec<Operation> =
            serde_json::from_str(&other_summary.operations.unwrap()).unwrap();

        let summary = client.received_transaction(Uuid::new_v4(), 1, other_operations);

        // we should generate the thumbnail as we overwrite the unsaved value again
        assert_eq!(summary.generate_thumbnail, true);

        // we should still have out unsaved transaction
        assert_eq!(client.unsaved_transactions.len(), 1);

        // our unsaved value overwrites the older multiplayer value
        assert_eq!(
            client
                .try_sheet_from_id(sheet_id)
                .unwrap()
                .get_cell_value(Pos { x: 0, y: 0 }),
            Some(CellValue::Text("Client unsaved value".to_string()))
        );
    }

    #[test]
    fn test_handle_receipt_of_out_of_order_transactions() {
        // client is where the multiplayer transactions are applied from other
        let mut client = GridController::new();
        let sheet_id = client.sheet_ids()[0];

        // other is where the transaction are created
        let mut other = GridController::new();
        other.grid_mut().sheets_mut()[0].id = sheet_id;
        let out_of_order_1_summary = other.set_cell_value(
            SheetPos {
                x: 1,
                y: 1,
                sheet_id,
            },
            "This is sequence_num = 1".to_string(),
            None,
        );
        let out_of_order_1_operations =
            serde_json::from_str(&out_of_order_1_summary.operations.unwrap()).unwrap();
        let out_of_order_2 = other.set_cell_value(
            SheetPos {
                x: 2,
                y: 2,
                sheet_id,
            },
            "This is sequence_num = 2".to_string(),
            None,
        );
        let out_of_order_2_operations =
            serde_json::from_str(&out_of_order_2.operations.unwrap()).unwrap();

        // Send sequence_num = 2 first to client. Client stores this transaction in out_of_order_transactions but does not apply it.
        client.received_transaction(Uuid::new_v4(), 2, out_of_order_2_operations);
        assert_eq!(
            client
                .try_sheet_from_id(sheet_id)
                .unwrap()
                .get_cell_value(Pos { x: 1, y: 1 }),
            None
        );
        assert_eq!(client.out_of_order_transactions.len(), 1);

        // We receive the correctly ordered transaction. Both are applied in the correct order.
        client.received_transaction(Uuid::new_v4(), 1, out_of_order_1_operations);
        assert_eq!(
            client
                .try_sheet_from_id(sheet_id)
                .unwrap()
                .get_cell_value(Pos { x: 1, y: 1 }),
            Some(CellValue::Text("This is sequence_num = 1".to_string()))
        );
        assert_eq!(
            client
                .try_sheet_from_id(sheet_id)
                .unwrap()
                .get_cell_value(Pos { x: 2, y: 2 }),
            Some(CellValue::Text("This is sequence_num = 2".to_string()))
        );
        assert_eq!(client.out_of_order_transactions.len(), 0);
    }

    #[test]
    fn test_handle_receipt_of_earlier_transactions_and_out_of_order_transactions() {
        let mut client = GridController::new();
        let sheet_id = client.sheet_ids()[0];
        let client_summary = client.set_cell_value(
            SheetPos {
                x: 0,
                y: 0,
                sheet_id,
            },
            "Client unsaved value".to_string(),
            None,
        );

        // other is where the transaction are created
        let mut other = GridController::new();
        other.grid_mut().sheets_mut()[0].id = sheet_id;
        let out_of_order_1_summary = other.set_cell_value(
            SheetPos {
                x: 0,
                y: 0,
                sheet_id,
            },
            "This is sequence_num = 1".to_string(),
            None,
        );
        let out_of_order_1_operations =
            serde_json::from_str(&out_of_order_1_summary.operations.unwrap()).unwrap();
        let out_of_order_2 = other.set_cell_value(
            SheetPos {
                x: 0,
                y: 0,
                sheet_id,
            },
            "This is sequence_num = 2".to_string(),
            None,
        );
        let out_of_order_2_operations =
            serde_json::from_str(&out_of_order_2.operations.unwrap()).unwrap();

        // Send sequence_num = 2 first to client. Client stores this transaction in out_of_order_transactions but does not apply it.
        // We should still see our unsaved transaction.
        client.received_transaction(Uuid::new_v4(), 2, out_of_order_2_operations);
        assert_eq!(
            client
                .try_sheet_from_id(sheet_id)
                .unwrap()
                .get_cell_value(Pos { x: 0, y: 0 }),
            Some(CellValue::Text("Client unsaved value".to_string()))
        );
        assert_eq!(client.out_of_order_transactions.len(), 1);
        assert_eq!(client.unsaved_transactions.len(), 1);

        // We receive the correctly ordered transaction. Both are applied in the correct order.
        client.received_transaction(Uuid::new_v4(), 1, out_of_order_1_operations);
        assert_eq!(
            client
                .try_sheet_from_id(sheet_id)
                .unwrap()
                .get_cell_value(Pos { x: 0, y: 0 }),
            Some(CellValue::Text("Client unsaved value".to_string()))
        );
        assert_eq!(client.out_of_order_transactions.len(), 0);

        // We receive our unsaved transaction back.
        client.received_transaction(
            Uuid::from_str(&client_summary.transaction_id.unwrap()).unwrap(),
            3,
            serde_json::from_str(&client_summary.operations.unwrap()).unwrap(),
        );
        assert_eq!(client.unsaved_transactions.len(), 0);
        assert_eq!(
            client
                .try_sheet_from_id(sheet_id)
                .unwrap()
                .get_cell_value(Pos { x: 0, y: 0 }),
            Some(CellValue::Text("Client unsaved value".to_string()))
        );

        // We undo our old unsaved transaction and it will clear it (since we don't update our undo stack w/server changes).
        client.undo(None);
        assert_eq!(
            client
                .try_sheet_from_id(sheet_id)
                .unwrap()
                .get_cell_value(Pos { x: 0, y: 0 }),
            None
        );
    }

    #[test]
    fn test_send_request_transactions() {
        let mut client = GridController::new();
        let sheet_id = client.sheet_ids()[0];

        // other is where the transaction are created
        let mut other = GridController::new();
        other.grid_mut().sheets_mut()[0].id = sheet_id;
        let other_1 = other.set_cell_value(
            SheetPos {
                x: 0,
                y: 0,
                sheet_id,
            },
            "This is sequence_num = 1".to_string(),
            None,
        );
        let other_1_operations = serde_json::from_str(&other_1.operations.unwrap()).unwrap();
        let other_2 = other.set_cell_value(
            SheetPos {
                x: 1,
                y: 1,
                sheet_id,
            },
            "This is sequence_num = 2".to_string(),
            None,
        );
        let other_2_operations = serde_json::from_str(&other_2.operations.unwrap()).unwrap();

        let client_summary = client.receive_sequence_num(2);

        // we send our last_sequence_num + 1 to the server so it can provide all later transactions
        assert_eq!(client.last_sequence_num, 0);
        assert_eq!(client_summary.request_transactions, Some(1));

        // todo: the sequence_num seems wrong here
        client.received_transactions(&vec![
            Transaction {
                id: Uuid::new_v4(),
                sequence_num: Some(1),
                operations: other_1_operations,
                cursor: None,
            },
            Transaction {
                id: Uuid::new_v4(),
                sequence_num: Some(2),
                operations: other_2_operations,
                cursor: None,
            },
        ]);
        assert_eq!(client.last_sequence_num, 2);

        assert_eq!(
            client
                .try_sheet_from_id(sheet_id)
                .unwrap()
                .get_cell_value(Pos { x: 0, y: 0 }),
            Some(CellValue::Text("This is sequence_num = 1".to_string()))
        );
        assert_eq!(
            client
                .try_sheet_from_id(sheet_id)
                .unwrap()
                .get_cell_value(Pos { x: 1, y: 1 }),
            Some(CellValue::Text("This is sequence_num = 2".to_string()))
        );
    }
}
