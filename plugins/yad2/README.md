https://gw.yad2.co.il/recommerce-feed/search?itemsPerPage=100&q=ps4+pro&pageNumber=1&scrollSessionId=2026-06-16T02%3A28%3A30.530Z

-  q: what we care about?
-  a: id, location, price, prev-price and other interesting info
```json
{
  "data": {
    "items": [
      {
        "id": 1234567890123,
        "address": {
          "area": {
            "id": "1",
            "textHeb": "אזור תל אביב",
            "textEng": "tel_aviv_area"
          },
          "city": {
            "id": "1234",
            "textHeb": "תל אביב",
            "textEng": "Tel Aviv"
          }
        },
        "categoryId": 30,
        "condition": {
          "id": "1",
          "textHeb": "חדש"
        },
        "custId": 9876543,
        "images": [
          "https://example.com/images/image1.jpg",
          "https://example.com/images/image2.jpg"
        ],
        "isSMB": true,
        "isVerified": true,
        "orderTypeId": 2,
        "price": 800,
        "previousPrice": 900,
        "productType": {
          "id": "5678",
          "textHeb": "מחשבים"
        },
        "promotions": [],
        "tags": [],
        "title": "Laptop XYZ 15\"",
        "urlIdentifier": "laptop-xyz-15",
        "adId": "abcdef12-3456-7890-abcd-ef1234567890",
        "video": null,
        "isDressed": true
      }
    ]
  }
}

```
for id: $some-id
api for fetching the phone number 
https://gw.yad2.co.il/recommerce-feed/recommerce-item/$some-id/customer
```
{"data":{"phone":"some-phone-number"},"message":"OK"}
```

getting more info about the product
https://www.yad2.co.il/market/item/$some-id



* getting info from the product page (seller location, item description)
 page: https://www.yad2.co.il/market/item/$some-id?component-type=main_feed&opened-from=feed&spot=1&location=1

 ----------------------------------
 
- get the product description
```js
// Select the element using the data-testid attribute
const descriptionElement = document.querySelector('[data-testid="item-description-text"]');

// Extract the text content from the element
const description = descriptionElement ? descriptionElement.textContent : null;

// Log the description
console.log(description);
```

- get the seller name:
```js
// Select the element containing the seller's name using a wildcard selector
const sellerNameElement = document.querySelector('[class^="private-seller_name__"]');

// Extract the text content from the element
const sellerName = sellerNameElement ? sellerNameElement.textContent : null;

// Log the seller's name
console.log(sellerName);
```

- get the seller location:
```js
// Select the element containing the city name using the data-testid attribute
const cityElement = document.querySelector('[data-testid="item-city"] dt[data-testid="product-detail"]');

// Extract the text content from the element
const cityName = cityElement ? cityElement.textContent : null;

// Log the city name
console.log(cityName);
```


- get the product title:
```js
// Select the element containing the product title using the data-testid attribute
const titleElement = document.querySelector('[data-testid="product-title"]');

// Extract the text content from the element
const productTitle = titleElement ? titleElement.textContent : null;

// Log the product title
console.log(productTitle);
```