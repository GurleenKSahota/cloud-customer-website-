#!/bin/bash
# Create a Cognito user for the employee-facing internal website.
# Usage:
#   ./create-user.sh user@example.com
#   ./create-user.sh user@example.com --username johndoe

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/infrastructure"

# Get Cognito User Pool ID from Terraform output
USER_POOL_ID=$(terraform -chdir="$INFRA_DIR" output -raw cognito_user_pool_id)
REGION=$(terraform -chdir="$INFRA_DIR" output -raw aws_region 2>/dev/null || echo "us-east-1")

# Parse arguments
EMAIL="$1"
USERNAME=""

if [[ -z "$EMAIL" ]]; then
  echo "Usage: ./create-user.sh <email> [--username <username>]"
  echo ""
  echo "Creates a Cognito user with a temporary password."
  echo "The user will be prompted to set a new password on first login."
  exit 1
fi

# Check for optional --username flag
if [[ "$2" == "--username" && -n "$3" ]]; then
  USERNAME="$3"
else
  USERNAME="$EMAIL"
fi

# Generate a temporary password
TEMP_PASSWORD="TempPass$(date +%s | tail -c 5)!"

echo "=== Creating Cognito Employee User ==="
echo "User Pool:  $USER_POOL_ID"
echo "Email:      $EMAIL"
echo "Username:   $USERNAME"
echo ""

# Create the user
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$USERNAME" \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
  --temporary-password "$TEMP_PASSWORD" \
  --message-action SUPPRESS \
  --region "$REGION"

echo "✅ User created successfully!"
echo ""
echo "Credentials for first login:"
echo "  Email:              $EMAIL"
echo "  Temporary password: $TEMP_PASSWORD"
echo ""
echo "The user will be prompted to set a new password on first login."
