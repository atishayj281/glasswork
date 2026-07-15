"""Generate a complex e-commerce orders dataset for Aegis demo recordings."""

import csv
import random
from datetime import date, timedelta
from pathlib import Path

random.seed(42)

REGIONS = ["North America", "Europe", "Asia Pacific", "Latin America", "Middle East"]
CATEGORIES = [
    "Electronics",
    "Apparel",
    "Home & Garden",
    "Sports",
    "Beauty",
    "Books",
    "Automotive",
    "Toys",
]
PRODUCTS = {
    "Electronics": ["Wireless Earbuds", "Smart Watch", "4K Monitor", "Mechanical Keyboard", "USB-C Hub"],
    "Apparel": ["Winter Jacket", "Running Shoes", "Denim Jeans", "Silk Scarf", "Athletic Shorts"],
    "Home & Garden": ["Air Purifier", "Ceramic Planter", "LED Desk Lamp", "Memory Foam Pillow", "Tool Set"],
    "Sports": ["Yoga Mat", "Dumbbell Set", "Tennis Racket", "Hiking Backpack", "Cycling Helmet"],
    "Beauty": ["Vitamin C Serum", "Hair Dryer", "Moisturizer", "Perfume Set", "Makeup Kit"],
    "Books": ["Data Science Handbook", "Fiction Bestseller", "Cookbook", "Biography", "Children's Atlas"],
    "Automotive": ["Dash Cam", "Floor Mats", "Phone Mount", "Tire Pressure Gauge", "Car Vacuum"],
    "Toys": ["Building Blocks", "Board Game", "RC Car", "Plush Toy", "Puzzle Set"],
}
SEGMENTS = ["Enterprise", "SMB", "Consumer", "Startup"]
PAYMENTS = ["Credit Card", "PayPal", "Wire Transfer", "Apple Pay", "Invoice"]
STATUSES = ["completed", "completed", "completed", "completed", "pending", "cancelled", "returned", "shipped"]

OUT = Path(__file__).parent / "data" / "ecommerce_orders_2024.csv"
OUT.parent.mkdir(parents=True, exist_ok=True)

start = date(2024, 1, 1)
end = date(2024, 12, 31)
rows = []

for i in range(1, 601):
    order_date = start + timedelta(days=random.randint(0, (end - start).days))
    region = random.choice(REGIONS)
    category = random.choice(CATEGORIES)
    product = random.choice(PRODUCTS[category])
    qty = random.randint(1, 12)
    unit_price = round(random.uniform(8.0, 899.0), 2)
    discount = round(random.choice([0, 0, 0, 5, 10, 15, 20, 25]), 1)
    shipping = round(random.uniform(0, 45.0), 2)
    status = random.choice(STATUSES)
    segment = random.choice(SEGMENTS)
    payment = random.choice(PAYMENTS)
    customer_id = f"CUST-{random.randint(1000, 9999)}"
    return_flag = "" if random.random() > 0.08 else "yes"
    sales_rep = random.choice(["Alice Chen", "Bob Martinez", "Carol Singh", "David Kim", ""]) if random.random() > 0.15 else ""

    gross = round(qty * unit_price * (1 - discount / 100), 2)

    rows.append(
        {
            "order_id": f"ORD-2024-{i:05d}",
            "order_date": order_date.isoformat(),
            "customer_id": customer_id,
            "region": region,
            "product_category": category,
            "product_name": product,
            "quantity": qty,
            "unit_price": unit_price,
            "discount_pct": discount,
            "gross_revenue": gross,
            "shipping_cost": shipping,
            "payment_method": payment,
            "order_status": status,
            "customer_segment": segment,
            "return_flag": return_flag,
            "sales_rep": sales_rep,
        }
    )

with OUT.open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)

print(f"Wrote {len(rows)} rows to {OUT}")
