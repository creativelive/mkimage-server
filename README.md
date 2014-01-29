# mkimage-server

On-demand image resize server based on 'express'

### Installation & running

> 1: assuming you have proper node 0.8.x installed

> 2: user that runs the server is 'mkimage'

> 3: set desired settings in `config` directory

    # install imagemagick
    sudo apt-get install --no-install-recommends build-essential imagemagick

    # clone the repo
    git clone git://github.com/Boxee/mkimage-server.git

    # install node dependencies
    cd mkimage-server && npm install

    # create `cache_dir`
    mkdir -p /mnt/cache/mkimage-server
    chown mkimage.mkimage /mnt/cache/mkimage-server

    # run it (in production)
    NODE_ENV=production bin/mkimage

##CreativeLive specific setup
in Ngninx setup
```
add to cdn.creativelive.com
  location ~* ^/(fill|fit|crop)/ {
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-NginX-Proxy true;
    proxy_pass http://mkserver;
    proxy_redirect off;
  }

add to creativelive.com
upstream mkserver {
  server 127.0.0.1:3020;
}

  location ~* ^/(fill|fit|crop)/ {
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-NginX-Proxy true;
    proxy_pass http://mkserver;
    proxy_redirect off;
  }
```
Haproxy will need to redirect those same routes fill/, fit/, and crop/ to whatever server is running the mkimage-server.

### Basic usage

 - `url` - the url of remote image to be converted (and cached)
 - `w` - width of resized image
 - `h` - height of resized image
 - `q` - quality of resized image (default is 92)

> the `url` parameter must be encoded, otherwise unexpected behaviour may occur.

- **the url** `http://www.google.com/images/icons/product/apps-128.png`
- **becomes** `http%3A%2F%2Fwww.google.com%2Fimages%2Ficons%2Fproduct%2Fapps-128.png`

### Examples

    # resize an image with keeping ratio (width)
    # /fit/{url}/{width}/{height?}
    http://example.com/fit/http%3A%2F%2Fwww.google.com%2Fimages%2Ficons%2Fproduct%2Fapps-128.png/200

    # resize an image with keeping ratio (width & height)
    http://example.com/fit/http%3A%2F%2Fwww.google.com%2Fimages%2Ficons%2Fproduct%2Fapps-128.png/100/200

    # resize an image to given size without keeping the ratio
    # /fill/{url}/{width}/{height}
    http://example.com/fill/http%3A%2F%2Fwww.google.com%2Fimages%2Ficons%2Fproduct%2Fapps-128.png/200/200

    # very basic crop for now, will add more options in future
    # /crop/{url}/{xOffset}/{yOffset}/{width}/{height}
    http://example.com/crop/http%3A%2F%2Fwww.google.com%2Fimages%2Ficons%2Fproduct%2Fapps-128.png/200/200/50/50

### Old API 
    # resize an image with keeping ratio (width)
    http://example.com/resize?url=http%3A%2F%2Fwww.google.com%2Fimages%2Ficons%2Fproduct%2Fapps-128.png&w=200

    # resize an image with keeping ratio (height)
    http://example.com/resize?url=http%3A%2F%2Fwww.google.com%2Fimages%2Ficons%2Fproduct%2Fapps-128.png&h=200

    # resize an image to given size without keeping the ratio
    http://example.com/stretch?url=http%3A%2F%2Fwww.google.com%2Fimages%2Ficons%2Fproduct%2Fapps-128.png&w=200&h=200

    # crop an image from the CENTER (height is optional),
    # very basic crop for now, will add more options in future
    http://example.com/crop?url=http%3A%2F%2Fwww.google.com%2Fimages%2Ficons%2Fproduct%2Fapps-128.png&w=200

    # return image with same size as original (just cache it)
    http://example.com/cache?url=http%3A%2F%2Fwww.google.com%2Fimages%2Ficons%2Fproduct%2Fapps-128.png
***

### *More docs comming soon*
