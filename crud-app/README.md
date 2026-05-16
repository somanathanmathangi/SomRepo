# Trip Manager - File Upload & Approval System

A Node.js/Express web application for managing trip records with file attachments and an approval workflow system.

## Features

### 1. **File Upload & Storage**
- Files are stored directly in the PostgreSQL database (BYTEA format)
- Only PDF files are accepted (max 10MB)
- Files can be downloaded directly from the application
- No external storage dependencies (SharePoint removed)

### 2. **Email Notifications**
- Automatic email notifications when trips are created or updated
- Configurable recipient email address
- HTML formatted emails with trip details
- Uses Nodemailer for email delivery

### 3. **Approval Workflow**
- New trips are created with "pending" status
- Separate approver portal for reviewing and approving/rejecting trips
- Approvers can add rejection reasons
- Status tracking: Pending → Approved/Rejected

### 4. **User Roles**
- **Admin Users**: Can create, edit, delete trips
- **Approver Users**: Can view all trips and approve/reject them
- Role-based access control

## Default Credentials

### Admin Users
- Username: `admin`, Password: `admin`
- Username: `admin1`, Password: `admin1`

### Approver User (Configurable)
- Username: `approver`, Password: `approver`

## Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL
- **Authentication**: express-session with bcrypt password hashing
- **File Upload**: Multer (memory storage)
- **Email**: Nodemailer
- **Frontend**: Vanilla JavaScript, HTML5, CSS3

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd crud-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up PostgreSQL database**
   - Create a database named `tripdb` (or your preferred name)
   - Update `DATABASE_URL` in `.env`

5. **Start the application**
   ```bash
   npm start
   ```

6. **Access the application**
   - Main app: http://localhost:3000
   - Approver portal: http://localhost:3000/approver-login.html

## Configuration

### Environment Variables (.env)

```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/tripdb

# Session
SESSION_SECRET=your-session-secret-key-here

# Email Configuration
EMAIL_TO=somanathan_c@yahoo.com          # Recipient for notifications
EMAIL_FROM=Trip Manager <noreply@...>    # Sender email
EMAIL_HOST=smtp.gmail.com                # SMTP host
EMAIL_PORT=587                           # SMTP port
EMAIL_SECURE=false                       # Use TLS
EMAIL_USER=your-email-username           # SMTP username
EMAIL_PASS=your-email-password           # SMTP password

# Approver Credentials (Configurable)
APPROVER_USERNAME=approver
APPROVER_PASSWORD=approver

# Application
APP_URL=http://localhost:3000
PORT=3000
NODE_ENV=development
```

## Database Schema

### trips table
- `yantriki_invoice_number` (TEXT, PRIMARY KEY)
- `customer_name`, `customer_location`, `po_order`, `po_date`
- `traveller_name`, `travel_route`, `wo_number`, `wo_date`
- `travel_start_date`, `travel_end_date`
- `file_name`, `file_type`, `file_content` (BYTEA) - File storage
- `status` (TEXT) - 'pending', 'approved', 'rejected'
- `approved_by`, `approved_date` - Approval tracking
- `rejection_reason` (TEXT) - Reason for rejection
- `created_by`, `created_date`, `updated_by`, `updated_date`, `deleted_by`, `deleted_date` - Audit trail

### admin_users table
- `username` (TEXT, PRIMARY KEY)
- `password_hash` (TEXT)
- `role` (TEXT) - 'admin' or 'approver'

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Trips
- `GET /api/trips` - Get all trips
- `GET /api/trips/pending` - Get pending trips (approvers only)
- `GET /api/trips/search?keyword=` - Search trips
- `POST /api/trips` - Create new trip (with optional file)
- `PUT /api/trips/:invoice` - Update trip
- `DELETE /api/trips/:invoice` - Delete trip (soft delete)

### File Operations
- `POST /api/trips/:invoice/upload` - Upload file for trip
- `GET /api/trips/:invoice/file` - Download file from trip

### Approval (Approvers Only)
- `POST /api/trips/:invoice/approve` - Approve a trip
- `POST /api/trips/:invoice/reject` - Reject a trip (with reason)

## Usage

### Creating a Trip with File Attachment

1. Log in as an admin user at http://localhost:3000
2. Click "Record Trip" tab
3. Fill in all required trip details
4. (Optional) Select a file to attach
5. Click "Add Trip Record"
6. System will:
   - Create the trip with "pending" status
   - Store the file in the database
   - Send email notification to configured address

### Approving/Rejecting Trips

1. Log in as an approver at http://localhost:3000/approver-login.html
2. View pending trips in the "Pending Approvals" tab
3. Click "Approve" to approve a trip
4. Click "Reject" to reject (must provide reason)
5. View all trips and their status in the "All Trips" tab

## Email Notifications

When a trip is created or updated, an HTML email is sent to the configured `EMAIL_TO` address with:
- Trip details in a formatted table
- Direct link to the approver dashboard
- Professional styling

## Security Features

- Password hashing with bcrypt
- Session-based authentication
- Role-based access control
- SQL injection protection via parameterized queries
- CSRF protection via session cookies
- File size limits (10MB)
- Input validation and sanitization

## File Storage

Files are stored as binary data (BYTEA) in PostgreSQL:
- No file system dependencies
- Automatic cleanup when trips are deleted
- Direct download from database
- Supports any file type

## License

MIT