# Unified Business Operations Interface

## 1. Unified Business Operations Interface

**User Story:** As a staff member, I want to access the functions assigned to my role from a unified business interface, so that I can perform my responsibilities without switching between separate systems.

**Acceptance Criteria:**

- Given a staff member has a registered account, when they log in, then the system authenticates them and identifies their assigned role and permissions.
- Given a staff member has a specific role, when authentication is completed, then the system displays the interface and functions applicable to that role.
- Given a staff member is assigned to sales, when they access the system, then they are presented with the POS interface rather than the administrative dashboard.
- Given a staff member is assigned an administrative role, when they access the system, then they are presented with the comprehensive management dashboard.
- Given Repairs and POS are separate business functions, when a user accesses either function, then each retains its own workflow and functionality while remaining accessible within the unified system.
- Given the system uses the existing Odoo backend, when a user performs an action through the new interface, then the relevant data is processed through the existing backend via API integration.

## 2. POS/Sales Interface

**User Story:** As a cashier or sales staff member, I want a simple POS interface for processing sales, so that I can complete transactions quickly without navigating the complex Odoo sales interface.

**Acceptance Criteria:**

- Given a cashier logs in, when the POS interface loads, then the cashier can immediately begin a sales transaction without navigating through administrative menus.
- Given the cashier is creating a sale, when they search for a product, then the system allows them to find and select the required product.
- Given a product is selected, when the cashier enters the required quantity and SKU information, then the selected items and quantities are reflected in the transaction.
- Given the cashier has completed the transaction details, when they proceed to checkout, then the system creates the corresponding sales transaction through the existing Odoo backend.
- Given a sale has been successfully processed, when the transaction is completed, then the system generates the applicable customer invoice and receipt.
- Given the POS interface is a new frontend, when a cashier performs a sales function, then the system uses the existing Odoo functionality through API integration without creating a separate backend instance.
- Given a customer wants to pay using more than one payment method, when the cashier checks out the sale, then the system allows the sale to be split across multiple payment methods whose amounts add up to the sale total.
- Given a split payment is being entered, when the allocated amounts do not yet add up to the sale total, then the system blocks checkout and shows the outstanding balance still to be allocated.
- Given a sale was paid with more than one payment method, when the receipt or sale record is viewed, then the amount charged to each payment method is itemized.
- Given no cash shift is currently open, when a cashier attempts to charge a sale, then the system blocks the charge and prompts the cashier to start a shift first.

## 3. Admin Dashboard

**User Story:** As an administrator, I want a centralized dashboard showing key business activities and performance across the different modules, so that I can get a clear snapshot of the business from one place.

**Acceptance Criteria:**

- Given an administrator logs in, when the dashboard loads, then the system displays a consolidated overview of the business.
- Given sales data is available, when the administrator views the dashboard, then the system displays relevant sales metrics such as total sales for the day and highest-selling items.
- Given sales occur through different channels, when the administrator views sales reporting, then the system can distinguish relevant channels such as website sales and in-store/POS sales.
- Given repair data is available, when the administrator views the dashboard, then repair activity is presented as a separate reporting area from sales.
- Given multiple business activities are available, when the administrator views the dashboard, then the system provides separate reporting sections for the relevant functions rather than combining their operational workflows.
- Given an administrator needs more detail, when they select a relevant dashboard metric or activity, then the system opens the corresponding detailed data view.

## 4. Staff Role Management

**User Story:** As an administrator, I want to assign roles to staff members, so that each staff member can access the functions and interface required for their responsibilities.

**Acceptance Criteria:**

- Given an administrator creates or manages a staff account, when they assign a role, then the system saves the selected role against the staff profile.
- Given a staff member is assigned a Sales/Cashier role, when they log in, then the system provides access to the POS/Sales interface.
- Given a staff member is assigned an Admin role, when they log in, then the system provides access to the administrative dashboard and permitted management functions.
- Given a staff member is assigned another operational role, when they log in, then the system displays only the functions permitted for that role.
- Given a staff member's role or permissions are changed, when they next access the system, then their available functions reflect the updated permissions.

## 5. Cash Shift Management

**User Story:** As a cashier, I want to open and close a cash shift with an opening and closing float, so that the cash I handle during my shift can be reconciled against sales.

**Acceptance Criteria:**

- Given a cashier has no active shift, when they choose to start one, then the system records the opening cash float they counted and marks the shift as active.
- Given a cashier has an active shift, when they choose to end it, then the system prompts for the counted closing float.
- Given a shift is ended with a closing float, when the system reconciles the shift, then it compares the counted closing float against the expected cash (opening float plus cash collected during the shift, including the cash portion of any split-payment sales) and reports the variance.
- Given a shift has just ended, when the cashier is ready to resume sales, then they can start a new shift on their own initiative rather than being forced into one immediately.
- Given no shift is currently open, when a cashier tries to complete a sale, then the system prevents the sale and directs them to start a shift first.
