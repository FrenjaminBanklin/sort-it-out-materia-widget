const SortItOut = angular.module("SortItOutEngine", ["ngAnimate", "hmTouchEvents"])

// force scope to update when scrolling
SortItOut.directive("scroll", () => {
	return {
		link: (scope, element) => {
			element.bind("wheel", () => scope.$apply())
			element.bind("touchmove", () => scope.$apply())
		}
	}
})

SortItOut.controller("SortItOutEngineCtrl", ["$scope", "$timeout", "sanitizeHelper", function ($scope, $timeout, sanitizeHelper) {
	$scope.tutorialPage = 1
	$scope.showFolderPreview = false
	$scope.showNoSubmit = false
	$scope.selectedItem = false
	$scope.desktopItems = []
	$scope.folders = []
	$scope.enlargeImage = {
		show: false,
		url: ""
	}

	let prevPosition       // start position of drag
	let selectedElement    // element that is being dragged
	let pickupCount = 1    // every new item picked up will go to the top (z-index)
	let itemSource         // to track where the dragged item came from
	let questionToId       // used for scoring

	const SRC_DESKTOP = -1 // indicates drag started on desktop, otherwise itemSource is folderIndex
	const MARGIN_SIZE = 20 // #preview-scroll-container margin size
	const DOCK_HEIGHT = 125

	$scope.start = (instance, qset, version) => {
		generateQuestionToId(qset)
		generateBounds()
		$scope.title = instance.name
		$scope.folders = buildFolders(qset)
		$scope.desktopItems = buildItems(qset)
		$scope.backgroundImage = "assets/desktop.jpg"
		if (qset.options.backgroundImageId) {
			$scope.backgroundImage = Materia.Engine.getMediaUrl(
				qset.options.backgroundImageId
			)
		} else if (qset.options.backgroundImageAsset) {
			$scope.backgroundImage = qset.options.backgroundImageAsset
		}
		$scope.$apply()
	}

	const generateQuestionToId = qset => {
		questionToId = {}
		for (let item of qset.items) {
			questionToId[item.questions[0].text] = item.id
		}
	}

	const generateBounds = () => {
		const width = $("#desktop").width()
		const height = $("#desktop").height()
		const menuBarHeight = $("#menu-bar").outerHeight()

		$scope.placementBounds = {
			x: {
				min: 15,
				max: width - 150
			},
			y: {
				min: menuBarHeight + 5,
				max: height - 15
			}
		}

		$scope.dragBounds = {
			x: {
				min: 15,
				max: width - 15
			},
			y: {
				min: menuBarHeight + 5,
				max: menuBarHeight + height - 15
			}
		}
	}

	const buildFolders = qset => {
		let folderNames = new Set
		qset.items.forEach( item => {
			folderNames.add(sanitizeHelper.desanitize(item.answers[0].text))
		})
		return Array.from(folderNames).map( text => {
			return { text, items: [] }
		})
	}

	const buildItems = qset => {
		return qset.items.map( item => {
			const image = item.options.image
				? Materia.Engine.getMediaUrl(item.options.image)
				: false
			return {
				text: sanitizeHelper.desanitize(item.questions[0].text),
				image,
				position: generateRandomPosition(item.options.image)
			}
		})
	}

	const generateRandomPosition = hasImage => {
		const pb = $scope.placementBounds

		const yRange = pb.y.max - pb.y.min - DOCK_HEIGHT - (hasImage ? 150 : 0)
		const y = ~~(Math.random() * yRange) + pb.y.min

		const xRange = pb.x.max - pb.x.min
		const x = ~~(Math.random() * xRange) + pb.x.min

		return { x, y }
	}

	$scope.hideTutorial = () => $(".tutorial").fadeOut()

	$scope.itemMouseDown = (e, item) => {
		if ($scope.selectedItem) {
			return // prevent duplicated calls
		}
		$scope.selectedItem = item

		// hammer events store the element differently
		selectedElement = e.element ? e.element[0] : e.currentTarget

		const left = parseInt($(selectedElement).css("left"), 10)
		const top = parseInt($(selectedElement).css("top"), 10)

		$scope.offsetLeft = left - e.clientX
		$scope.offsetTop = top - e.clientY

		$(selectedElement).css({ top, left, "z-index": pickupCount++ })
		prevPosition = { top, left }
		itemSource = SRC_DESKTOP
	}

	$scope.isOutOfBounds = e => {
		const db = $scope.dragBounds
		const outOfBoundsX = e.clientX < db.x.min || e.clientX > db.x.max
		const outOfBoundsY = e.clientY < db.y.min || e.clientY > db.y.max
		return outOfBoundsX || outOfBoundsY
	}

	// hammer event properties are different from native, this changes the event
	// and will call the regular function after
	$scope.standardizeEvent = (hammerEvent, param2, cb) => {
		hammerEvent.clientX = hammerEvent.center.x
		hammerEvent.clientY = hammerEvent.center.y
		hammerEvent.currentTarget = hammerEvent.target
		if (param2) {
			cb(hammerEvent, param2)
		} else {
			cb(hammerEvent)
		}
	}

	$scope.panMove = e => {
		const underElem = $(document.elementFromPoint(e.clientX, e.clientY))
		const folderElem = underElem.closest(".folder")
		if (folderElem.length) {
			const index = folderElem.data("index")
			$(`.folder[data-index=${index}]`).addClass("peeked")
			$(selectedElement).addClass("shrink")
		} else {
			$(".shrink").removeClass("shrink")
			$(".peeked").removeClass("peeked")
		}

		if (selectedElement) {
			if ($scope.isOutOfBounds(e)) {
				return $scope.mouseUp(e)
			}
			const left = e.clientX + $scope.offsetLeft
			const top = e.clientY + $scope.offsetTop
			$(selectedElement).css({ top, left })
		}
	}

	$scope.mouseUp = e => {
		$(".peeked").removeClass("peeked")
		if (!selectedElement) {
			return
		}
		if (e.stopPropagation) {
			e.stopPropagation()
		}

		const underElem = $(document.elementFromPoint(e.clientX, e.clientY))
		const underElemId = underElem.attr("id")

		// put it back if it's out of bounds or over the dock but not a folder
		if ($scope.isOutOfBounds(e) || underElemId == "dock-main") {
			$(".shrink").removeClass("shrink")
			$(selectedElement).animate({
				left: prevPosition.left,
				top: Math.min(prevPosition.top, $scope.placementBounds.y.max)
			}, 300)
		} else {
			// if dragged on a folder, put it in
			const folderElem = underElem.closest(".folder")
			if (folderElem.length) {
				$scope.selectFolder(e, folderElem.data("index"))
			}

			// source is a folder, destination is back-to-desktop
			if (itemSource != SRC_DESKTOP && underElem.hasClass("desktop-zone")) {
				$scope.folders[itemSource].items = $scope.folders[itemSource].items.filter(
					item => item.text != $scope.selectedItem.text
				)
				$scope.selectedItem.position = {
					x: e.clientX + $scope.offsetLeft,
					y: e.clientY + $scope.offsetTop
				}
				$scope.desktopItems.push($scope.selectedItem)
			}
		}

		selectedElement = false
		$scope.selectedItem = false
		itemSource = SRC_DESKTOP
	}

	$scope.selectFolder = (e, index) => {
		if (e.stopPropagation) {
			e.stopPropagation()
		}

		if (index == itemSource) {
			return // if dragged to where it already is
		}

		// if currently-opened folder is clicked, close that folder
		if (index == $scope.folderPreviewIndex) {
			$scope.hideFolderPreview()
			return
		}

		if ($scope.selectedItem) {
			$scope.folders[index].items.push($scope.selectedItem)

			if (itemSource == SRC_DESKTOP) {
				$scope.desktopItems = $scope.desktopItems.filter(
					item => item.text != $scope.selectedItem.text
				)
			} else {
				$scope.folders[itemSource].items = $scope.folders[itemSource].items.filter(
					item => item.text != $scope.selectedItem.text
				)
			}

			$(".desktop-item.selected").removeClass("selected")
			selectedElement = false
			$scope.selectedItem = false
			itemSource = SRC_DESKTOP
		} else {
			$scope.showFolderPreview = true
			$scope.folderPreviewIndex = index
		}
	}

	$scope.hideFolderPreview = () => {
		$scope.showFolderPreview = false
		$scope.folderPreviewIndex = -1
	}

	$scope.previewMouseDown = (e, item) => {
		selectedElement = $("#preview-selected-item")[0]
		$scope.selectedItem = item

		let { left, top } = $(e.currentTarget).offset()

		// slight shift to keep things looking good
		left -= 10
		top -= 10

		// if there's an image, move it down so it seems more centered
		if (item.image) {
			top -= 25
		}

		// if preview item is long, shift drag item to match
		if (e.clientX - left > 150) {
			left += (e.clientX - left) / 2
		}

		$scope.offsetLeft = left - e.clientX
		$scope.offsetTop = top - e.clientY

		$(selectedElement).css({ top, left })
		itemSource = $scope.folderPreviewIndex
	}

	$scope.peekFolder = index => {
		$(`.folder[data-index=${index}]`).addClass("peeked")
	}

	$scope.hidePeek = () => {
		$(".peeked").removeClass("peeked")
	}

	$scope.enlargeImage = (url, e) => {
		if (e.stopPropagation) {
			e.stopPropagation()
		}
		$scope.enlargeImage.url = url
		$scope.enlargeImage.show = true
	}

	// this is used to prevent dragging of the images on macOS
	$scope.preventDefault = (e, stopPropagation) => {
		if (e.preventDefault) {
			e.preventDefault()
		}
		if (stopPropagation && e.stopPropagation) {
			e.stopPropagation()
		}
	}

	$scope.canScrollUp = () => $("#preview-scroll-container").scrollTop() > 0

	$scope.canScrollDown = () => {
		const e = $("#preview-scroll-container")
		const scrollBottom = e.scrollTop() + e.height()
		const containerBottom = e[0].scrollHeight - MARGIN_SIZE
		return scrollBottom < containerBottom
	}

	$scope.scrollUp = () => {
		const currTop = $("#preview-scroll-container").scrollTop()
		$("#preview-scroll-container").animate({
			scrollTop: currTop - 100
		}, 300, () => $scope.$apply())
	}

	$scope.scrollDown = () => {
		const currTop = $("#preview-scroll-container").scrollTop()
		$("#preview-scroll-container").animate({
			scrollTop: currTop + 100
		}, 300, () => $scope.$apply())
	}

	$scope.readyToSubmit = () => {
		return $scope.folders.length > 0 && $scope.desktopItems.length == 0
	}

	$scope.submitClick = () => {
		if (!$scope.readyToSubmit()) {
			$scope.showNoSubmit = true
			$timeout( () => {
				$scope.showNoSubmit = false
			}, 5000)
			return
		}

		$scope.folders.forEach( ({text, items}) => {
			items.forEach( item => {
				const id = questionToId[item.text]
				Materia.Score.submitQuestionForScoring(id, text)
			})
		})
		Materia.Engine.end()
	}

	Materia.Engine.start($scope)
}])

SortItOut.service('sanitizeHelper', [ function() {
	const SANITIZE_CHARACTERS = {
		'&' : '&amp;',
		'>' : '&gt;',
		'<' : '&lt;',
		'"' : '&#34;'
	}

	const sanitize = (input) => {
		if (!input) return;
		for (var k in SANITIZE_CHARACTERS) {
			let v = SANITIZE_CHARACTERS[k]
			let re = new RegExp(k, "g")
			input = input.replace(re, v)
		}
		return input
	}

	const desanitize = (input) => {
		if (!input) return;
		for (var k in SANITIZE_CHARACTERS) {
			let v = SANITIZE_CHARACTERS[k]
			let re = new RegExp(v, "g")
			input = input.replace(re, k)
		}
		return input
	}
	return {
		sanitize: sanitize,
		desanitize: desanitize
	}
}])