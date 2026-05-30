# Implementation Plan

## Backend Changes (server.js)
- [x] Add validation: Customer Name should not contain numeric values
- [x] Add validation: Traveller Name should not contain numeric values
- [x] Restrict approve/reject endpoints to only `approver` role (not `admin`)
- [x] Add `customers` table (Customer Name, Customer Location)
- [x] Add CRUD API for customers management
- [x] Add CRUD API for admin_users management (User Administration)

## Frontend Changes
- [x] Create admin.html - Admin Dashboard page (User Admin + Customer Management tabs)
- [x] Create admin.js - Admin Dashboard logic
- [x] Update login.html - Redirect admin users to admin.html instead of approver.html
- [x] Update approver-login.html - Admin users go to admin.html
- [x] Update index.html - Add admin navigation, hide Record/ShowAll/Search tabs for admin
- [x] Update app.js - Admin role redirection and tab hiding
- [x] Update server.js - Customer name/traveller name validation on create/update