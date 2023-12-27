use crate::{
    controller::{operations::operation::Operation, GridController},
    grid::{Sheet, SheetId},
};

impl GridController {
    pub(crate) fn execute_add_sheet(&mut self, op: &Operation) {
        match op.clone() {
            Operation::AddSheet { sheet } => {
                let sheet_id = sheet.id;
                self.grid
                    .add_sheet(Some(sheet.clone()))
                    .expect("Unexpected duplicate sheet name in Operation::AddSheet");
                self.summary.sheet_list_modified = true;
                self.summary.html.insert(sheet_id);
                self.forward_operations.push(Operation::AddSheet { sheet });
                self.reverse_operations
                    .insert(0, Operation::DeleteSheet { sheet_id });
            }
            _ => unreachable!("Expected Operation::AddSheet"),
        }
    }

    pub(crate) fn execute_delete_sheet(&mut self, op: &Operation, is_user: bool) {
        match op.clone() {
            Operation::DeleteSheet { sheet_id } => {
                let deleted_sheet = self.grid.remove_sheet(sheet_id);

                // create a sheet if we deleted the last one (only for user actions)
                if is_user && self.sheet_ids().is_empty() {
                    let new_first_sheet_id = SheetId::new();
                    let name = String::from("Sheet 1");
                    let order = self.grid.end_order();
                    let new_first_sheet = Sheet::new(new_first_sheet_id, name, order);
                    self.grid
                        .add_sheet(Some(new_first_sheet.clone()))
                        .expect("This should not throw an error as we just deleted the last sheet and therefore there can be no sheet name conflicts");
                    self.forward_operations
                        .push(Operation::DeleteSheet { sheet_id });
                    self.forward_operations.push(Operation::AddSheet {
                        sheet: new_first_sheet,
                    });
                    self.reverse_operations.insert(
                        0,
                        Operation::AddSheet {
                            sheet: deleted_sheet,
                        },
                    );
                    self.reverse_operations.insert(
                        0,
                        Operation::DeleteSheet {
                            sheet_id: new_first_sheet_id,
                        },
                    );
                } else {
                    self.forward_operations
                        .push(Operation::DeleteSheet { sheet_id });
                    self.reverse_operations.insert(
                        0,
                        Operation::AddSheet {
                            sheet: deleted_sheet,
                        },
                    );
                }
                self.summary.sheet_list_modified = true;
            }
            _ => unreachable!("Expected operation::DeleteSheet"),
        }
    }

    pub(crate) fn execute_reorder_sheet(&mut self, op: &Operation) {
        match op.clone() {
            Operation::ReorderSheet { target, order } => {
                let old_first = self.grid.first_sheet_id();
                let sheet = self.grid.sheet_from_id(target);
                let original_order = sheet.order.clone();
                self.grid.move_sheet(target, order.clone());
                self.summary.sheet_list_modified = true;

                if old_first != self.grid.first_sheet_id() {
                    self.summary.generate_thumbnail = true;
                }
                self.forward_operations
                    .push(Operation::ReorderSheet { target, order });
                self.reverse_operations.insert(
                    0,
                    Operation::ReorderSheet {
                        target,
                        order: original_order,
                    },
                );
            }
            _ => unreachable!("Expected operation::ReorderSheet"),
        }
    }

    pub(crate) fn execute_set_sheet_name(&mut self, op: &Operation) {
        match op.clone() {
            Operation::SetSheetName { sheet_id, name } => {
                let sheet = self.grid.sheet_mut_from_id(sheet_id);
                let old_name = sheet.name.clone();
                sheet.name = name.clone();
                self.summary.sheet_list_modified = true;
                self.forward_operations
                    .push(Operation::SetSheetName { sheet_id, name });
                self.reverse_operations.insert(
                    0,
                    Operation::SetSheetName {
                        sheet_id,
                        name: old_name,
                    },
                );
            }
            _ => unreachable!("Expected operation::SetSheetName"),
        }
    }

    pub(crate) fn execute_set_sheet_color(&mut self, op: &Operation) {
        match op.clone() {
            Operation::SetSheetColor { sheet_id, color } => {
                let sheet = self.grid.sheet_mut_from_id(sheet_id);
                let old_color = sheet.color.clone();
                sheet.color = color.clone();
                self.summary.sheet_list_modified = true;
                self.forward_operations
                    .push(Operation::SetSheetColor { sheet_id, color });
                self.reverse_operations.insert(
                    0,
                    Operation::SetSheetColor {
                        sheet_id,
                        color: old_color,
                    },
                );
            }
            _ => unreachable!("Expected operation::SetSheetColor"),
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::controller::GridController;

    #[test]
    fn test_add_sheet() {
        let mut gc = GridController::new();
        let summary = gc.add_sheet(None);
        assert_eq!(gc.grid.sheets().len(), 2);
        assert!(summary.save);
        assert!(summary.sheet_list_modified);
        gc.undo(None);
        assert_eq!(gc.grid.sheets().len(), 1);
        assert!(summary.save);
        assert!(summary.sheet_list_modified);
    }

    #[test]
    fn test_delete_sheet() {
        let mut gc = GridController::new();
        let sheet_id = gc.sheet_ids()[0];
        let summary = gc.delete_sheet(sheet_id, None);
        assert_eq!(gc.grid.sheets().len(), 1);
        assert!(summary.save);
        assert!(summary.sheet_list_modified);
        gc.undo(None);
        assert_eq!(gc.grid.sheets().len(), 1);
        assert_eq!(gc.grid.sheets()[0].id, sheet_id);
        assert!(summary.save);
        assert!(summary.sheet_list_modified);
    }

    #[test]
    fn test_execute_operation_set_sheet_name() {
        let mut gc = GridController::new();
        let sheet_id = gc.sheet_ids()[0];
        let name = "new name".to_string();
        let summary = gc.set_sheet_name(sheet_id, name.clone(), None);
        assert_eq!(gc.grid.sheets()[0].name, name);
        assert!(summary.save);
        assert!(summary.sheet_list_modified);
        gc.undo(None);
        assert_eq!(gc.grid.sheets()[0].name, "Sheet 1".to_string());
        assert!(summary.save);
        assert!(summary.sheet_list_modified);
    }

    #[test]
    fn test_set_sheet_color() {
        let mut gc = GridController::new();
        let sheet_id = gc.sheet_ids()[0];
        let color = Some("red".to_string());
        let summary = gc.set_sheet_color(sheet_id, color.clone(), None);
        assert_eq!(gc.grid.sheets()[0].color, color);
        assert!(summary.save);
        assert!(summary.sheet_list_modified);
        gc.undo(None);
        assert_eq!(gc.grid.sheets()[0].color, None);
        assert!(summary.save);
        assert!(summary.sheet_list_modified);
    }

    #[test]
    fn test_sheet_reorder() {
        let mut gc = GridController::new();
        let sheet_id = gc.sheet_ids()[0];
        gc.add_sheet(None);
        assert_eq!(gc.grid.sheets().len(), 2);
        let sheet_id2 = gc.sheet_ids()[1];
        let summary = gc.move_sheet(sheet_id, None, None);
        assert_eq!(gc.grid.sheets()[0].id, sheet_id2);
        assert_eq!(gc.grid.sheets()[1].id, sheet_id);
        assert!(summary.save);
        assert!(summary.sheet_list_modified);
        gc.undo(None);
        assert_eq!(gc.grid.sheets()[0].id, sheet_id);
        assert_eq!(gc.grid.sheets()[1].id, sheet_id2);
        assert!(summary.save);
        assert!(summary.sheet_list_modified);
        let summary = gc.move_sheet(sheet_id2, Some(sheet_id), None);
        assert_eq!(gc.grid.sheets()[0].id, sheet_id2);
        assert_eq!(gc.grid.sheets()[1].id, sheet_id);
        assert!(summary.save);
        assert!(summary.sheet_list_modified);
        gc.undo(None);
        assert_eq!(gc.grid.sheets()[0].id, sheet_id);
        assert_eq!(gc.grid.sheets()[1].id, sheet_id2);
        assert!(summary.save);
        assert!(summary.sheet_list_modified);
    }
}
