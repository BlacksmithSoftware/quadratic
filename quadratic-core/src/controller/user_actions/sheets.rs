use crate::{
    controller::{
        execution::TransactionType, transaction_summary::TransactionSummary, GridController,
    },
    grid::SheetId,
};

impl GridController {
    pub fn set_sheet_name(
        &mut self,
        sheet_id: SheetId,
        name: String,
        cursor: Option<String>,
    ) -> TransactionSummary {
        let ops = self.set_sheet_name_operations(sheet_id, name);
        self.set_in_progress_transaction(ops, cursor, false, TransactionType::User)
    }

    pub fn set_sheet_color(
        &mut self,
        sheet_id: SheetId,
        color: Option<String>,
        cursor: Option<String>,
    ) -> TransactionSummary {
        let ops = self.set_sheet_color_operations(sheet_id, color);
        self.set_in_progress_transaction(ops, cursor, false, TransactionType::User)
    }

    pub fn add_sheet(&mut self, cursor: Option<String>) -> TransactionSummary {
        let ops = self.add_sheet_operations();
        self.set_in_progress_transaction(ops, cursor, false, TransactionType::User)
    }
    pub fn delete_sheet(
        &mut self,
        sheet_id: SheetId,
        cursor: Option<String>,
    ) -> TransactionSummary {
        let ops = self.delete_sheet_operations(sheet_id);
        self.set_in_progress_transaction(ops, cursor, false, TransactionType::User)
    }
    pub fn move_sheet(
        &mut self,
        sheet_id: SheetId,
        to_before: Option<SheetId>,
        cursor: Option<String>,
    ) -> TransactionSummary {
        let ops = self.move_sheet_operations(sheet_id, to_before);
        self.set_in_progress_transaction(ops, cursor, false, TransactionType::User)
    }
    pub fn duplicate_sheet(
        &mut self,
        sheet_id: SheetId,
        cursor: Option<String>,
    ) -> TransactionSummary {
        let ops = self.duplicate_sheet_operations(sheet_id);
        self.set_in_progress_transaction(ops, cursor, false, TransactionType::User)
    }
}

#[cfg(test)]
mod test {
    use crate::{controller::GridController, grid::SheetId};

    #[test]
    fn test_add_delete_reorder_sheets() {
        let mut g = GridController::new();
        g.add_sheet(None);
        g.add_sheet(None);
        let old_sheet_ids = g.sheet_ids();
        let s1 = old_sheet_ids[0];
        let s2 = old_sheet_ids[1];
        let s3 = old_sheet_ids[2];

        fn test_reorder(
            g: &mut GridController,
            a: SheetId,
            b: Option<SheetId>,
            expected: [SheetId; 3],
            old_sheet_ids: &Vec<SheetId>,
        ) {
            g.move_sheet(a, b, None);
            assert_eq!(expected.to_vec(), g.sheet_ids());
            g.undo(None);
            assert_eq!(*old_sheet_ids, g.sheet_ids());
        }

        test_reorder(&mut g, s1, Some(s2), [s1, s2, s3], &old_sheet_ids);
        test_reorder(&mut g, s1, Some(s3), [s2, s1, s3], &old_sheet_ids);
        test_reorder(&mut g, s1, None, [s2, s3, s1], &old_sheet_ids);
        test_reorder(&mut g, s2, Some(s1), [s2, s1, s3], &old_sheet_ids);
        test_reorder(&mut g, s2, Some(s3), [s1, s2, s3], &old_sheet_ids);
        test_reorder(&mut g, s2, None, [s1, s3, s2], &old_sheet_ids);
        test_reorder(&mut g, s3, Some(s1), [s3, s1, s2], &old_sheet_ids);
        test_reorder(&mut g, s3, Some(s2), [s1, s3, s2], &old_sheet_ids);
        test_reorder(&mut g, s3, None, [s1, s2, s3], &old_sheet_ids);

        fn test_delete(
            g: &mut GridController,
            a: SheetId,
            expected: [SheetId; 2],
            old_sheet_ids: &Vec<SheetId>,
        ) {
            g.delete_sheet(a, None);
            assert_eq!(expected.to_vec(), g.sheet_ids());
            g.undo(None);
            assert_eq!(*old_sheet_ids, g.sheet_ids());
        }

        test_delete(&mut g, s1, [s2, s3], &old_sheet_ids);
        test_delete(&mut g, s2, [s1, s3], &old_sheet_ids);
        test_delete(&mut g, s3, [s1, s2], &old_sheet_ids);
    }

    #[test]
    fn test_duplicate_sheet() {
        let mut g = GridController::new();
        let old_sheet_ids = g.sheet_ids();
        let s1 = old_sheet_ids[0];

        g.set_sheet_name(s1, String::from("Nice Name"), None);
        g.duplicate_sheet(s1, None);
        let sheet_ids = g.sheet_ids();
        let s2 = sheet_ids[1];

        let sheet1 = g.sheet(s1);
        let sheet2 = g.sheet(s2);

        assert_eq!(sheet2.name, format!("{} Copy", sheet1.name));
    }

    #[test]
    fn test_delete_last_sheet() {
        let mut g = GridController::new();
        let sheet_ids = g.sheet_ids();
        let first_sheet_id = sheet_ids[0];

        g.delete_sheet(first_sheet_id, None);
        let new_sheet_ids = g.sheet_ids();
        assert_eq!(new_sheet_ids.len(), 1);
        assert_ne!(new_sheet_ids[0], sheet_ids[0]);

        g.undo(None);
        let new_sheet_ids_2 = g.sheet_ids();
        assert_eq!(sheet_ids[0], new_sheet_ids_2[0]);

        g.redo(None);
        let new_sheet_ids_3 = g.sheet_ids();
        assert_eq!(new_sheet_ids[0], new_sheet_ids_3[0]);
    }
}
